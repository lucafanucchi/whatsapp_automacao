from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import httpx
# NOVO: Importa a classe BaseModel do Pydantic
from pydantic import BaseModel

# =============================================================================
# NOVO: Definindo um modelo para os dados da requisição
# Isso diz ao FastAPI para esperar um JSON com os campos "numero" e "mensagem".
# =============================================================================
class MensagemPayload(BaseModel):
    numero: str
    mensagem: str

app = FastAPI(
    title="API de Automação de WhatsApp",
    description="Orquestra o envio de campanhas via Gateway.",
    version="0.1.0"
)

# Configuração do CORS (continua igual)
origins = ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GATEWAY_URL = "https://whatsapp-gateway-a9iz.onrender.com/send-message"

# ALTERADO: A assinatura da função agora usa o nosso modelo Pydantic
@app.post("/enviar-teste")
async def enviar_mensagem_teste(payload: MensagemPayload):
    """
    Este endpoint recebe um payload JSON com numero e mensagem,
    e o encaminha para o gateway do WhatsApp.
    """
    # ALTERADO: Acessamos os dados através do objeto 'payload'
    print(f"Recebida requisição para enviar '{payload.mensagem}' para o número {payload.numero}")
    
    # O resto da função continua muito parecido
    if "SEU-GATEWAY-NO-RENDER" in GATEWAY_URL:
        raise HTTPException(status_code=400, detail="ERRO: A URL do Gateway não foi configurada.")

    # Monta o payload para o gateway
    gateway_payload = {
        "number": payload.numero,
        "message": payload.mensagem
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(GATEWAY_URL, json=gateway_payload, timeout=30.0)
        
        response.raise_for_status() 
        print("Gateway respondeu com sucesso.")
        return response.json()

    except httpx.HTTPStatusError as e:
        print(f"Erro de status do Gateway: {e.response.status_code}")
        print(f"Detalhes: {e.response.text}")
        raise HTTPException(status_code=e.response.status_code, detail=f"Erro no Gateway: {e.response.json()}")
    except httpx.RequestError as e:
        print(f"Não foi possível conectar ao Gateway: {e}")
        raise HTTPException(status_code=503, detail="Não foi possível conectar ao Gateway de WhatsApp.")

@app.get("/")
def ler_raiz():
    return {"status": "Backend da Automação de WhatsApp está no ar!"}