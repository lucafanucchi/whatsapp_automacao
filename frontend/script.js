// =============================================================================
// ATENÇÃO!
// Cole aqui a URL do seu serviço de BACKEND implantado no Render.
// =============================================================================
const BACKEND_URL = "https://whatsapp-backend-km3f.onrender.com";


// --- Selecionando os elementos da página ---
const form = document.getElementById('campanha-form');
const mensagemTextarea = document.getElementById('mensagem');
const numerosTextarea = document.getElementById('numeros');
const enviarBtn = document.getElementById('enviar-btn');
const feedbackDiv = document.getElementById('feedback-envio');


// --- Adicionando o listener de evento para o formulário ---
form.addEventListener('submit', async function(event) {
    event.preventDefault(); // Impede o recarregamento da página

    const mensagem = mensagemTextarea.value.trim();
    const numeros = numerosTextarea.value.trim().split('\n').filter(n => n); // Pega os números, separa por linha e remove linhas vazias

    if (!mensagem || numeros.length === 0) {
        adicionarLog('Por favor, preencha a mensagem e a lista de números.', 'error');
        return;
    }
    
    // Desabilita o botão para evitar cliques duplos
    enviarBtn.disabled = true;
    enviarBtn.textContent = 'Enviando...';
    feedbackDiv.innerHTML = ''; // Limpa o log antigo

    adicionarLog(`Iniciando campanha para ${numeros.length} número(s).`);

    // Envia uma mensagem por vez para simular um comportamento mais humano
    for (const numero of numeros) {
        adicionarLog(`Tentando enviar para ${numero}...`);
        try {
            // Chama a função que faz a requisição para o backend
            const resposta = await enviarMensagemParaBackend(numero, mensagem);
            adicionarLog(`--> Sucesso: Mensagem enviada para ${numero}.`, 'success');
        } catch (error) {
            adicionarLog(`--> Falha: Erro ao enviar para ${numero}. Detalhes: ${error.message}`, 'error');
        }
        // Uma pequena pausa entre os envios
        await new Promise(resolve => setTimeout(resolve, 1000)); // Pausa de 1 segundo
    }

    adicionarLog('Campanha finalizada!');
    // Habilita o botão novamente
    enviarBtn.disabled = false;
    enviarBtn.textContent = 'Enviar Campanha';
});


// --- Função para se comunicar com nosso backend ---
async function enviarMensagemParaBackend(numero, mensagem) {
    // Monta a URL completa do endpoint
    const endpoint = `${BACKEND_URL}/enviar-teste`;
    
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            numero: numero.trim(), // Remove espaços extras do número
            mensagem: mensagem
        }),
    });

    if (!response.ok) {
        // Se a resposta não for OK (ex: 404, 500), tenta ler o erro do corpo da resposta
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Erro desconhecido do servidor.');
    }

    return response.json(); // Retorna os dados de sucesso
}


// --- Função auxiliar para mostrar logs na tela ---
function adicionarLog(texto, tipo = 'info') {
    const logElement = document.createElement('div');
    logElement.textContent = texto;
    logElement.className = `log ${tipo}`; // Adiciona classe para estilização (success, error)
    
    feedbackDiv.appendChild(logElement);
    feedbackDiv.scrollTop = feedbackDiv.scrollHeight; // Rola para o final
}