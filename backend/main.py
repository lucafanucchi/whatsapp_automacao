from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import httpx
from pydantic import BaseModel
from typing import Optional

class MensagemPayload(BaseModel):
    numero: str
    mensagem: str
    anexo_url: Optional[str] = None # Renomeado para 'anexo'
    file_name: Optional[str] = None # NOVO
    mime_type: Optional[str] = None # NOVO

app = FastAPI(
    title="API de Automação de WhatsApp",
    description="Orquestra o envio de campanhas via Gateway.",
    version="0.1.0"
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


@app.post("/enviar-teste")
async def enviar_mensagem_teste(payload: MensagemPayload):
    # Monta o payload para o gateway, agora incluindo a URL da imagem
    gateway_payload = {
        "number": payload.numero,
        "message": payload.mensagem,
        "anexoUrl": payload.anexo_url, # Renomeado
        "fileName": payload.file_name,  # NOVO
        "mimeType": payload.mime_type  # NOVO (use camelCase para o JavaScript)
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(GATEWAY_URL, json=gateway_payload, timeout=30.0)
        
        response.raise_for_status() 
        return response.json()
    except Exception as e:
        print(f"Erro ao contatar o gateway: {e}")
        raise HTTPException(status_code=503, detail="Não foi possível se comunicar com o Gateway de WhatsApp.")

# Removeremos o endpoint de debug para limpar o código
# @app.get("/testar-conexao-externa") ...

@app.get("/")
def ler_raiz():
    return {"status": "Backend da Automação de WhatsApp está no ar!"}