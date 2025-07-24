# backend/main.py (Versão com a Correção Final do Payload de Texto)

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict
import httpx
import boto3
import os
import uuid
import asyncio
import random
from datetime import datetime, timezone, timedelta

# =================================================================================
# --- CONFIGURAÇÃO PRINCIPAL ---
# =================================================================================

EVOLUTION_API_URL = os.getenv("EVOLUTION_API_URL")
EVOLUTION_API_KEY = os.getenv("EVOLUTION_API_KEY") # Corrigido para a variável correta do .env

R2_ACCOUNT_ID = os.getenv("R2_ACCOUNT_ID")
R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY")
R2_BUCKET_NAME = os.getenv("R2_BUCKET_NAME")
R2_PUBLIC_URL = os.getenv("R2_PUBLIC_URL")

# =================================================================================
# --- INICIALIZAÇÃO E MODELOS ---
# =================================================================================

s3 = boto3.client(
    's3',
    endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
    aws_access_key_id=R2_ACCESS_KEY_ID,
    aws_secret_access_key=R2_SECRET_ACCESS_KEY,
    region_name='auto'
)

campaign_history: Dict[str, List] = {}

class UrlPayload(BaseModel):
    file_name: str
    content_type: str

class Contato(BaseModel):
    numero: str
    nome: Optional[str] = None

class CampaignLog(BaseModel):
    id: str
    startTime: str
    endTime: Optional[str] = None
    status: str
    totalContacts: int
    sentCount: int
    failedCount: int
    lastContactProcessed: Optional[str] = None

class CampanhaPayload(BaseModel):
    contatos: List[Contato]
    mensagem: str
    anexo_key: Optional[str] = None
    mime_type: Optional[str] = None
    original_file_name: Optional[str] = None

app = FastAPI(title="API de Automação de WhatsApp", version="4.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
headers = { "apikey": EVOLUTION_API_KEY }

# =================================================================================
# --- LÓGICA DE ENVIO EM SEGUNDO PLANO ---
# =================================================================================

async def processar_envios_campanha(instance_name: str, payload: CampanhaPayload, log_entry: CampaignLog):
    for contato in payload.contatos:
        try:
            numero_para_envio = ''.join(filter(str.isdigit, contato.numero))
            mensagem_personalizada = payload.mensagem.replace('{nome}', contato.nome or '').strip()
            anexo_url_final = f"{R2_PUBLIC_URL}/{payload.anexo_key}" if payload.anexo_key else None
            
            endpoint_url = ""
            request_payload = {}

            if not anexo_url_final:
                # --- CORREÇÃO FINAL PARA TEXTO ---
                endpoint_url = f"{EVOLUTION_API_URL}/message/sendText/{instance_name}"
                # A API espera um objeto "textMessage" aninhado, mas a chave é 'text'
                request_payload = {
                    "number": numero_para_envio,
                    "textMessage": {
                        "text": mensagem_personalizada
                    },
                    "options": {
                        "delay": 1200,
                        "presence": "composing"
                    }
                }
                # --- FIM DA CORREÇÃO ---
            else:
                endpoint_url = f"{EVOLUTION_API_URL}/message/sendMedia/{instance_name}"
                media_type = "image"
                if payload.mime_type and payload.mime_type.startswith('video'):
                    media_type = "video"
                elif payload.mime_type and payload.mime_type == 'application/pdf':
                    media_type = "document"
                request_payload = {
                    "number": numero_para_envio,
                    "options": {"delay": 1200, "presence": "composing"},
                    "mediatype": media_type,
                    "caption": mensagem_personalizada,
                    "media": anexo_url_final,
                    "fileName": payload.original_file_name or "anexo"
                }

            log_entry.lastContactProcessed = contato.numero
            
            async with httpx.AsyncClient() as client:
                response = await client.post(endpoint_url, json=request_payload, headers=headers, timeout=60.0)
                response.raise_for_status()
            
            log_entry.sentCount += 1
        except Exception as e:
            print(f"Erro ao enviar para {contato.numero}: {e}")
            log_entry.failedCount += 1
        
        utc_now = datetime.now(timezone.utc)
        br_tz = timezone(timedelta(hours=-3))
        log_entry.endTime = utc_now.astimezone(br_tz).strftime("%Y-%m-%d %H:%M:%S")
        
        await asyncio.sleep(random.randint(15, 28))

    log_entry.status = "Finalizada" if log_entry.failedCount == 0 else "Finalizada com erros"
    print(f"Campanha {log_entry.id} finalizada.")

# =================================================================================
# --- ENDPOINTS DA APLICAÇÃO ---
# =================================================================================

@app.get("/")
def ler_raiz():
    return {"status": "Backend da Automação de WhatsApp (v4.1) está no ar!"}

@app.post("/gerar-url-upload")
async def gerar_url_upload(payload: UrlPayload):
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
        raise HTTPException(status_code=500, detail=f"Não foi possível gerar a URL de upload: {e}")

@app.post("/campanhas/enviar/{instance_name}")
async def enviar_campanha(instance_name: str, payload: CampanhaPayload):
    if instance_name not in campaign_history:
        campaign_history[instance_name] = []

    campaign_id = str(uuid.uuid4())
    utc_now = datetime.now(timezone.utc)
    br_tz = timezone(timedelta(hours=-3))
    start_time_br = utc_now.astimezone(br_tz).strftime("%Y-%m-%d %H:%M:%S")

    log_entry = CampaignLog(
        id=campaign_id,
        startTime=start_time_br,
        status="Em andamento",
        totalContacts=len(payload.contatos),
        sentCount=0,
        failedCount=0
    )
    campaign_history[instance_name].insert(0, log_entry)

    asyncio.create_task(processar_envios_campanha(instance_name, payload, log_entry))

    return {"status": "Campanha recebida e iniciada com sucesso.", "campaign_id": campaign_id}

@app.get("/campanhas/status/{campaign_id}")
async def get_campaign_status(campaign_id: str):
    for instance_campaigns in campaign_history.values():
        for campaign in instance_campaigns:
            if campaign.id == campaign_id:
                return campaign
    raise HTTPException(status_code=404, detail="Campanha não encontrada.")

@app.get("/campanhas/{instance_name}", response_model=List[CampaignLog])
async def get_campaign_history(instance_name: str):
    return campaign_history.get(instance_name, [])
    
@app.get("/conectar/qr-code/{instance_name}")
async def get_qr_code(instance_name: str):
    async with httpx.AsyncClient() as client:
        try:
            status_url = f"{EVOLUTION_API_URL}/instance/connectionState/{instance_name}"
            status_response = await client.get(status_url, headers=headers, timeout=10.0)
            instance_state = status_response.json().get("instance", {}).get("state")

            if instance_state == 'open':
                logout_url = f"{EVOLUTION_API_URL}/instance/logout/{instance_name}"
                await client.delete(logout_url, headers=headers, timeout=30.0)
                await asyncio.sleep(2)

            connect_url = f"{EVOLUTION_API_URL}/instance/connect/{instance_name}"
            connect_response = await client.get(connect_url, headers=headers, timeout=30.0)
            connect_response.raise_for_status()
            
            qr_data = connect_response.json()
            if not qr_data.get("base64"):
                raise HTTPException(status_code=500, detail="A API não retornou a chave 'base64'.")
            
            return qr_data
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Erro crítico no backend: {e}")

@app.get("/conectar/status/{instance_name}")
async def get_instance_status(instance_name: str):
    try:
        async with httpx.AsyncClient() as client:
            status_url = f"{EVOLUTION_API_URL}/instance/connectionState/{instance_name}"
            response = await client.get(status_url, headers=headers, timeout=10.0)
            response.raise_for_status()
            connection_state = response.json().get("instance", {}).get("state", "close")
            return {"status": connection_state}
    except Exception:
        return {"status": "close"}

@app.post("/conectar/logout/{instance_name}")
async def logout_instance(instance_name: str):
    try:
        async with httpx.AsyncClient() as client:
            logout_url = f"{EVOLUTION_API_URL}/instance/logout/{instance_name}"
            response = await client.delete(logout_url, headers=headers, timeout=30.0)
            response.raise_for_status()
            return {"success": True, "message": f"Instância {instance_name} desconectada com sucesso."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao desconectar instância: {e}")