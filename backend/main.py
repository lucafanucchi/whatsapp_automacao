# backend/main.py

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import httpx
from pydantic import BaseModel
from typing import Optional
import boto3
import os
import uuid
import phonenumbers # Importa a biblioteca

# --- CONFIGURAÇÃO DO R2 ---
R2_ACCOUNT_ID = os.getenv("R2_ACCOUNT_ID")
R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY")
R2_BUCKET_NAME = os.getenv("R2_BUCKET_NAME")
R2_PUBLIC_URL = os.getenv("R2_PUBLIC_URL") 

R2_ENDPOINT_URL = f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

if not R2_PUBLIC_URL:
    raise ValueError("A variável de ambiente R2_PUBLIC_URL não está configurada.")

s3 = boto3.client(
    's3',
    endpoint_url=R2_ENDPOINT_URL,
    aws_access_key_id=R2_ACCESS_KEY_ID,
    aws_secret_access_key=R2_SECRET_ACCESS_KEY,
    region_name='auto'
)

# --- MODELOS Pydantic ---
class UrlPayload(BaseModel):
    file_name: str
    content_type: str

class MensagemPayload(BaseModel):
    numero: str
    mensagem: str
    anexo_key: Optional[str] = None
    mime_type: Optional[str] = None
    original_file_name: Optional[str] = None

# --- APLICAÇÃO FastAPI ---
app = FastAPI(
    title="API de Automação de WhatsApp",
    description="Orquestra o envio de campanhas via Gateway, com uploads para o Cloudflare R2.",
    version="0.7.0" # Nova versão com validação corrigida
)

origins = ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GATEWAY_URL = "http://whatsapp-gateway-a9iz:10000/send-message"

# --- ENDPOINTS ---

@app.post("/gerar-url-upload")
async def gerar_url_upload(payload: UrlPayload):
    clean_file_name = payload.file_name.replace(" ", "_")
    unique_key = f"{uuid.uuid4()}-{clean_file_name}"

    try:
        presigned_url = s3.generate_presigned_url(
            ClientMethod='put_object',
            Params={
                'Bucket': R2_BUCKET_NAME,
                'Key': unique_key,
                'ContentType': payload.content_type
            },
            ExpiresIn=3600
        )
        return {"upload_url": presigned_url, "object_key": unique_key}
    except Exception as e:
        print(f"Erro ao gerar URL pré-assinada: {e}")
        raise HTTPException(status_code=500, detail="Não foi possível gerar a URL de upload.")


@app.post("/enviar-teste")
async def enviar_mensagem_teste(payload: MensagemPayload):
    
    # --- NOVO: BLOCO DE VALIDAÇÃO E FORMATAÇÃO (VERSÃO CORRIGIDA) ---
    numero_formatado = None
    try:
        # Para garantir a análise correta, adicionamos um '+' se o número não o tiver
        numero_bruto = payload.numero
        if not numero_bruto.startswith('+'):
            numero_bruto = f"+{numero_bruto}"

        # A biblioteca agora analisa o número no formato internacional
        numero_parseado = phonenumbers.parse(numero_bruto, None)
        
        # A ÚNICA VERIFICAÇÃO QUE FAZEMOS É SE O NÚMERO É VÁLIDO PARA A REGIÃO.
        # Não importa mais se é fixo ou celular.
        if not phonenumbers.is_valid_number(numero_parseado):
            raise ValueError(f"O formato do número {payload.numero} é inválido.")

        # Formatamos para o padrão E164 (ex: +5511999998888) e removemos o '+' para o gateway.
        numero_formatado = phonenumbers.format_number(numero_parseado, phonenumbers.PhoneNumberFormat.E164)[1:]

    except Exception as e:
        print(f"Erro ao validar o número {payload.numero}: {e}")
        raise HTTPException(status_code=400, detail=f"O número '{payload.numero}' foi bloqueado pela validação: {e}")
    # --- FIM DO NOVO BLOCO ---

    anexo_url_final = None
    if payload.anexo_key:
        anexo_url_final = f"{R2_PUBLIC_URL}/{payload.anexo_key}"

    gateway_payload = {
        "number": numero_formatado,
        "message": payload.mensagem,
        "anexoUrl": anexo_url_final,
        "fileName": payload.original_file_name,
        "mimeType": payload.mime_type
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(GATEWAY_URL, json=gateway_payload, timeout=30.0)
        
        response.raise_for_status() 
        return response.json()
    except Exception as e:
        print(f"Erro ao contatar o gateway: {e}")
        raise HTTPException(status_code=503, detail="Não foi possível se comunicar com o Gateway de WhatsApp.")

@app.get("/")
def ler_raiz():
    return {"status": "Backend da Automação de WhatsApp (com R2 e Validação Final) está no ar!"}