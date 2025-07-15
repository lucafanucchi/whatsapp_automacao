# backend/main.py

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import httpx
from pydantic import BaseModel
from typing import Optional
import boto3
import os
import uuid

# --- CONFIGURAÇÃO DO R2 ---
# Pegue estes valores das suas variáveis de ambiente/secrets no Render
R2_ACCOUNT_ID = os.getenv("R2_ACCOUNT_ID")
R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY")
R2_BUCKET_NAME = os.getenv("R2_BUCKET_NAME")
R2_PUBLIC_URL = os.getenv("R2_PUBLIC_URL") 

# O endpoint é o "Endpoint S3" do seu R2
R2_ENDPOINT_URL = f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

s3 = boto3.client(
    's3',
    endpoint_url=R2_ENDPOINT_URL,
    aws_access_key_id=R2_ACCESS_KEY_ID,
    aws_secret_access_key=R2_SECRET_ACCESS_KEY,
    region_name='auto' # Região é 'auto' para o R2
)

# --- MODELOS Pydantic ---
class UrlPayload(BaseModel):
    file_name: str
    content_type: str

class MensagemPayload(BaseModel):
    numero: str
    mensagem: str
    # O anexo agora é apenas o nome do arquivo (a chave do objeto no R2)
    anexo_key: Optional[str] = None 

# --- APLICAÇÃO FastAPI ---
app = FastAPI(
    title="API de Automação de WhatsApp",
    description="Orquestra o envio de campanhas via Gateway, com uploads para o Cloudflare R2.",
    version="0.2.0"
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
    """
    Gera uma URL de upload pré-assinada para o frontend enviar o arquivo diretamente para o R2.
    """
    # Gera um nome de arquivo único para evitar sobreposições
    unique_key = f"{uuid.uuid4()}-{payload.file_name}"

    try:
        presigned_url = s3.generate_presigned_url(
            ClientMethod='put_object',
            Params={
                'Bucket': R2_BUCKET_NAME,
                'Key': unique_key,
                'ContentType': payload.content_type
            },
            ExpiresIn=3600  # A URL expira em 1 hora
        )
        # Retorna a URL para o upload e a chave final do objeto
        return {"upload_url": presigned_url, "object_key": unique_key}
    except Exception as e:
        print(f"Erro ao gerar URL pré-assinada: {e}")
        raise HTTPException(status_code=500, detail="Não foi possível gerar a URL de upload.")


@app.post("/enviar-teste")
async def enviar_mensagem_teste(payload: MensagemPayload):
    # Constrói a URL pública final do anexo, se houver
    anexo_url_final = None
    if payload.anexo_key:
        anexo_url_final = f"{R2_PUBLIC_URL}/{payload.anexo_key}"

    # Monta o payload para o gateway
    gateway_payload = {
        "number": payload.numero,
        "message": payload.mensagem,
        "anexoUrl": anexo_url_final,
        # O fileName pode continuar sendo o anexo_key ou um nome mais amigável, se preferir
        "fileName": payload.anexo_key
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
    return {"status": "Backend da Automação de WhatsApp (com R2) está no ar!"}