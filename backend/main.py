from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import httpx
from pydantic import BaseModel

class MensagemPayload(BaseModel):
    numero: str
    mensagem: str

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

GATEWAY_URL = "https://whatsapp-gateway-a9iz.onrender.com/send-message"

# =============================================================================
# NOVO ENDPOINT DE DEBUG
# Para testar se o container no Render consegue fazer chamadas para a internet.
# =============================================================================
@app.get("/testar-conexao-externa")
async def testar_conexao_externa():
    print("Iniciando teste de conexão externa para https://api.publicapis.org/entries")
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get("https://api.publicapis.org/entries", timeout=15.0)
        response.raise_for_status()
        print("Conexão externa bem-sucedida!")
        return {"status": "SUCESSO", "detail": "O container consegue fazer requisições HTTPS para a internet."}
    except Exception as e:
        print(f"FALHA na conexão externa: {e}")
        raise HTTPException(status_code=500, detail=f"Falha ao conectar externamente: {e}")


@app.post("/enviar-teste")
async def enviar_mensagem_teste(payload: MensagemPayload):
    print(f"Recebida requisição para enviar '{payload.mensagem}' para o número {payload.numero}")
    
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
        # =============================================================================
        # MUDANÇA IMPORTANTE AQUI!
        # Extraindo mais detalhes da exceção.
        # =============================================================================
        print("--- INÍCIO DO DEBUG DE ERRO HTTpx ---")
        print(f"Tipo de exceção: {type(e)}")
        print(f"Argumentos da exceção: {e.args}")
        print(f"Requisição que falhou: {e.request}")
        print("--- FIM DO DEBUG DE ERRO HTTpx ---")
        raise HTTPException(status_code=503, detail="Não foi possível conectar ao Gateway de WhatsApp.")

@app.get("/")
def ler_raiz():
    return {"status": "Backend da Automação de WhatsApp está no ar!"}