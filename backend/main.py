from fastapi import FastAPI, HTTPException
import httpx # Biblioteca moderna para fazer requisições HTTP

app = FastAPI(
    title="API de Automação de WhatsApp",
    description="Orquestra o envio de campanhas via Gateway.",
    version="0.1.0"
)

# =============================================================================
# ATENÇÃO!
# Após fazer o deploy do serviço 'whatsapp-gateway' no Render,
# você deve copiar a URL fornecida por ele e colar aqui.
# =============================================================================
GATEWAY_URL = "https://whatsapp-gateway-a9iz.onrender.com/send-message"

@app.post("/enviar-teste")
async def enviar_mensagem_teste(numero: str, mensagem: str):
    """
    Endpoint de teste para verificar a comunicação entre o Backend e o Gateway.
    Formato do número esperado: 5511999998888 (código do país + ddd + numero)
    """
    print(f"Recebida requisição para enviar '{mensagem}' para o número {numero}")
    
    if "SEU-GATEWAY-NO-RENDER" in GATEWAY_URL:
        raise HTTPException(
            status_code=400,
            detail="ERRO: A URL do Gateway ainda não foi configurada. Por favor, atualize a variável GATEWAY_URL no arquivo main.py."
        )

    payload = {
        "number": numero,
        "message": mensagem
    }

    try:
        # Usamos httpx para fazer uma chamada assíncrona para o nosso gateway
        async with httpx.AsyncClient() as client:
            response = await client.post(GATEWAY_URL, json=payload, timeout=30.0)
        
        # Verifica se a requisição para o gateway foi bem sucedida
        response.raise_for_status() 

        print("Gateway respondeu com sucesso.")
        return response.json()

    except httpx.HTTPStatusError as e:
        # Erro na resposta do gateway (ex: número não encontrado, etc.)
        print(f"Erro de status do Gateway: {e.response.status_code}")
        print(f"Detalhes: {e.response.text}")
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"Erro no Gateway: {e.response.json()}"
        )
    except httpx.RequestError as e:
        # Erro de conexão com o gateway (ex: gateway está offline)
        print(f"Não foi possível conectar ao Gateway: {e}")
        raise HTTPException(
            status_code=503, # Service Unavailable
            detail="Não foi possível conectar ao Gateway de WhatsApp. Verifique se ele está rodando."
        )

@app.get("/")
def ler_raiz():
    return {"status": "Backend da Automação de WhatsApp está no ar!"}