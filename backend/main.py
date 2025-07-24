# backend/main.py

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import httpx
import boto3
import os
import uuid
import asyncio
import random

# =================================================================================
# --- CONFIGURAÇÃO PRINCIPAL ---
# Altere estas variáveis com os dados do seu ambiente.
# =================================================================================

# --- Configurações da Evolution API ---
EVOLUTION_API_URL = os.getenv("EVOLUTION_API_URL")  # O endereço IP do seu VPS onde a Evolution API está rodando.
# ATENÇÃO: Substitua pela sua chave real que está no docker-compose.yml
EVOLUTION_API_KEY = os.getenv("EVOLUTION_API_KEY")

# --- Configurações do Cloudflare R2 (lidas do ambiente) ---
R2_ACCOUNT_ID = os.getenv("R2_ACCOUNT_ID")
R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY")
R2_BUCKET_NAME = os.getenv("R2_BUCKET_NAME")
R2_PUBLIC_URL = os.getenv("R2_PUBLIC_URL")

# Validação das variáveis de ambiente do R2
if not all([R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL]):
    raise ValueError("Uma ou mais variáveis de ambiente do Cloudflare R2 não estão configuradas.")

# =================================================================================
# --- INICIALIZAÇÃO DE SERVIÇOS E DA APLICAÇÃO ---
# =================================================================================

# Cliente S3 para o Cloudflare R2
s3 = boto3.client(
    's3',
    endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
    aws_access_key_id=R2_ACCESS_KEY_ID,
    aws_secret_access_key=R2_SECRET_ACCESS_KEY,
    region_name='auto'
)

# Modelos Pydantic para validação de dados
class UrlPayload(BaseModel):
    file_name: str
    content_type: str

class MensagemPayload(BaseModel):
    numero: str
    mensagem: str
    anexo_key: Optional[str] = None
    mime_type: Optional[str] = None
    original_file_name: Optional[str] = None

# Aplicação FastAPI
app = FastAPI(
    title="API de Automação de WhatsApp com Evolution",
    description="Orquestra o envio de campanhas via Evolution API, com uploads para o Cloudflare R2 e gerenciamento de conexão.",
    version="2.0.0"
)

# Middleware CORS para permitir acesso de qualquer origem (seu frontend)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Headers de autenticação para a Evolution API
headers = {
    "apikey": EVOLUTION_API_KEY
}

# =================================================================================
# --- ENDPOINTS DA APLICAÇÃO ---
# =================================================================================

@app.get("/")
def ler_raiz():
    return {"status": "Backend da Automação de WhatsApp (com Evolution API) está no ar!"}

@app.post("/gerar-url-upload")
async def gerar_url_upload(payload: UrlPayload):
    """Gera uma URL pré-assinada para o frontend fazer upload de um arquivo diretamente para o R2."""
    clean_file_name = payload.file_name.replace(" ", "_")
    unique_key = f"{uuid.uuid4()}-{clean_file_name}"
    try:
        presigned_url = s3.generate_presigned_url(
            ClientMethod='put_object',
            Params={'Bucket': R2_BUCKET_NAME, 'Key': unique_key, 'ContentType': payload.content_type},
            ExpiresIn=3600
        )
        return {"upload_url": presigned_url, "object_key": unique_key}
    except Exception as e:
        print(f"Erro ao gerar URL de upload: {e}")
        raise HTTPException(status_code=500, detail="Não foi possível gerar a URL de upload.")

# Em main.py, substitua a função de envio inteira por esta versão final e correta:

@app.post("/enviar/{instance_name}")
async def enviar_mensagem(instance_name: str, payload: MensagemPayload):
    """
    Envia uma mensagem (texto ou mídia) com o payload formatado corretamente para a Evolution API v2.
    """
    numero_para_envio = ''.join(filter(str.isdigit, payload.numero))
    
    endpoint_url = ""
    request_payload = {}

    anexo_url_final = f"{R2_PUBLIC_URL}/{payload.anexo_key}" if payload.anexo_key else None

    if not anexo_url_final:
        # Payload para mensagens de TEXTO (que já estava correto)
        endpoint_url = f"{EVOLUTION_API_URL}/message/sendText/{instance_name}"
        request_payload = {
            "number": numero_para_envio,
            "textMessage": {
                "text": payload.mensagem
            },
            "options": {
                "delay": 1200,
                "presence": "composing"
            }
        }
    else:
        # --- CORREÇÃO FINAL E DEFINITIVA: Payload para MÍDIA com estrutura "plana" ---
        endpoint_url = f"{EVOLUTION_API_URL}/message/sendMedia/{instance_name}"
        
        media_type = "image"
        if payload.mime_type and payload.mime_type.startswith('video'):
            media_type = "video"
        elif payload.mime_type and payload.mime_type == 'application/pdf':
            media_type = "document"
        
        request_payload = {
            "number": numero_para_envio,
            "options": {
                "delay": 1200,
                "presence": "composing"
            },
            # Todas as propriedades da mídia estão agora no nível principal, como a API espera.
            "mediatype": media_type,
            "caption": payload.mensagem,
            "media": anexo_url_final,
            "fileName": payload.original_file_name or "anexo"
        }
        # --- FIM DA CORREÇÃO ---

    try:
        async with httpx.AsyncClient() as client:
            print(f"DEBUG: Enviando para {endpoint_url} com payload: {request_payload}")
            # Aumentado o timeout para dar tempo de a API baixar e processar a mídia
            response = await client.post(endpoint_url, json=request_payload, headers=headers, timeout=60.0) 
        
        response.raise_for_status()
        return response.json()
    except httpx.HTTPStatusError as e:
        print(f"ERRO da Evolution API: {e.response.status_code} - {e.response.text}")
        raise HTTPException(status_code=503, detail=f"A Evolution API retornou um erro: {e.response.text}")
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Falha ao enviar mensagem pela Evolution API: {e}")
# Em main.py, substitua a função get_qr_code inteira por esta versão final:

@app.get("/conectar/qr-code/{instance_name}")
async def get_qr_code(instance_name: str):
    """
    Obtém um QR Code para uma instância existente, desconectando-a primeiro se necessário.
    """
    async with httpx.AsyncClient() as client:
        try:
            # 1. Verifica o estado atual da instância.
            status_url = f"{EVOLUTION_API_URL}/instance/connectionState/{instance_name}"
            status_response = await client.get(status_url, headers=headers, timeout=10.0)
            instance_state = status_response.json().get("instance", {}).get("state")
            print(f"Estado atual da instância '{instance_name}': {instance_state}")

            # 2. Se a instância estiver conectada ('open'), força o logout primeiro.
            if instance_state == 'open':
                print(f"Instância '{instance_name}' está conectada. Forçando logout...")
                logout_url = f"{EVOLUTION_API_URL}/instance/logout/{instance_name}"
                await client.delete(logout_url, headers=headers, timeout=30.0)
                await asyncio.sleep(2)
                print(f"Logout da instância '{instance_name}' finalizado.")

            # 3. Agora que a instância está desconectada, pede o QR Code.
            print(f"Solicitando QR Code para a instância '{instance_name}'...")
            connect_url = f"{EVOLUTION_API_URL}/instance/connect/{instance_name}"
            connect_response = await client.get(connect_url, headers=headers, timeout=30.0)
            connect_response.raise_for_status()
            
            qr_data = connect_response.json()
            print(f"DEBUG: Resposta completa da API para o pedido de QR Code: {qr_data}")
            
            if not qr_data.get("base64"):
                raise HTTPException(status_code=500, detail="A API não retornou a chave 'base64' com os dados do QR Code.")
            
            return qr_data

        except Exception as e:
            print(f"ERRO CRÍTICO no processo de obtenção de QR Code: {e}")
            raise HTTPException(status_code=500, detail=f"Erro crítico no backend: {e}")


@app.get("/conectar/status/{instance_name}")
async def get_instance_status(instance_name: str):
    """Verifica o status da conexão de uma instância."""
    try:
        async with httpx.AsyncClient() as client:
            status_url = f"{EVOLUTION_API_URL}/instance/connectionState/{instance_name}"
            response = await client.get(status_url, headers=headers, timeout=10.0)
            response.raise_for_status()
            connection_state = response.json().get("instance", {}).get("state", "close")
            return {"status": connection_state}
    except Exception:
        return {"status": "close"} # Assume como desconectado se houver erro

@app.post("/conectar/logout/{instance_name}")
async def logout_instance(instance_name: str):
    """Desconecta uma instância para permitir uma nova conexão."""
    try:
        async with httpx.AsyncClient() as client:
            logout_url = f"{EVOLUTION_API_URL}/instance/logout/{instance_name}"
            # O logout pode ser POST ou DELETE dependendo da versão, DELETE é mais semântico
            response = await client.delete(logout_url, headers=headers, timeout=30.0)
            response.raise_for_status()
            return {"success": True, "message": f"Instância {instance_name} desconectada com sucesso."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao desconectar instância: {e}")