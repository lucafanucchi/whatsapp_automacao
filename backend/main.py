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
from datetime import datetime, timezone, timedelta

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

# --- NOVO: "Banco de Dados" em Memória para Histórico de Campanhas ---
# Para simplificar, usaremos um dicionário. Em um sistema de produção maior,
# isso seria uma tabela no seu banco de dados PostgreSQL.


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

# --- Novos Modelos Pydantic ---
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
    lastContactProcessed: Optional[str] = None # Novo campo para o log em tempo real
    logMessages: list[str] = []

class CampanhaPayload(BaseModel):
    contatos: list[Contato]
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

campaign_history = {}

# Headers de autenticação para a Evolution API
headers = {
    "apikey": EVOLUTION_API_KEY
}

# =================================================================================
# --- ENDPOINTS DA APLICAÇÃO ---
# =================================================================================

# Adicione esta função no início do seu main.py
async def calcular_delay_inteligente(contador_atual: int, total_contatos: int):
    """Delays mais humanizados e conservadores"""
    
    # Delay base mais alto (era 15-28, agora 35-60)
    base_delay = random.randint(35, 60)
    
    # A cada 5 mensagens, pausa maior (era a cada 10)
    if contador_atual % 5 == 0:
        base_delay += random.randint(180, 300)  # +3-5 min
        print(f"Pausa extra aplicada após {contador_atual} mensagens")
    
    # A cada 15 mensagens, pausa muito maior  
    if contador_atual % 15 == 0:
        base_delay += random.randint(600, 900)  # +10-15 min
        print(f"Pausa longa aplicada após {contador_atual} mensagens")
    
    return base_delay


async def processar_envios_campanha(instance_name: str, payload: CampanhaPayload, log_entry: CampaignLog):
    total_contatos = len(payload.contatos)
    log_entry.logMessages.append(f"Iniciando campanha para {total_contatos} contato(s).")
    for i, contato in enumerate(payload.contatos):
        contador_atual = i + 1
        try:
            log_entry.logMessages.append(f"({contador_atual}/{total_contatos}) Preparando para {contato.nome or contato.numero}...")
            numero_para_envio = ''.join(filter(str.isdigit, contato.numero))
            mensagem_personalizada = payload.mensagem.replace('{nome}', contato.nome or '').strip()
            anexo_url_final = f"{R2_PUBLIC_URL}/{payload.anexo_key}" if payload.anexo_key else None
            
            endpoint_url = ""
            request_payload = {}

            if not anexo_url_final:
                # --- CORREÇÃO FINAL PARA TEXTO ---
                endpoint_url = f"{EVOLUTION_API_URL}/message/sendText/{instance_name}"
                request_payload = {
                    "number": numero_para_envio,
                    "options": {
                        "delay": 5000,
                        "presence": "composing"
                    },

                    "text": mensagem_personalizada
                }
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
            log_entry.logMessages.append(f"--> Sucesso: Enviado para {contato.nome or contato.numero}.")
        except Exception as e:
            print(f"Erro ao enviar para {contato.numero}: {e}")
            log_entry.failedCount += 1
            log_entry.logMessages.append(f"--> Falha ao enviar para {contato.nome or contato.numero}.")
        
        utc_now = datetime.now(timezone.utc)
        br_tz = timezone(timedelta(hours=-3))
        log_entry.endTime = utc_now.astimezone(br_tz).strftime("%Y-%m-%d %H:%M:%S")
        
        if contador_atual < total_contatos:
            delay_seconds = await calcular_delay_inteligente(contador_atual, total_contatos)
    
    # Mostra tempo de forma mais amigável
        if delay_seconds >= 60:
            minutos = delay_seconds // 60
            segundos = delay_seconds % 60
            log_entry.logMessages.append(f"⏱️ Pausa de segurança: {minutos}m{segundos}s")
        else:
            log_entry.logMessages.append(f"⏱️ Aguardando {delay_seconds}s...")
    
        await asyncio.sleep(delay_seconds)

    log_entry.status = "Finalizada" if log_entry.failedCount == 0 else "Finalizada com erros"
    log_entry.logMessages.append("Campanha finalizada!")
    print(f"Campanha {log_entry.id} finalizada.")

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
    

# --- NOVO ENDPOINT PARA STATUS EM TEMPO REAL ---
@app.get("/campanhas/status/{campaign_id}")
async def get_campaign_status(campaign_id: str):
    """Busca o status atual de uma campanha específica pelo seu ID."""
    for instance_campaigns in campaign_history.values():
        for campaign in instance_campaigns:
            if campaign.id == campaign_id:
                return campaign
    raise HTTPException(status_code=404, detail="Campanha não encontrada.")

    
# --- NOVO ENDPOINT PARA CONSULTAR O HISTÓRICO ---
@app.get("/campanhas/{instance_name}", response_model=list[CampaignLog])
async def get_campaign_history(instance_name: str):
    """Retorna o histórico de campanhas para uma instância específica."""
    return campaign_history.get(instance_name, [])