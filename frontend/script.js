// =============================================================================
// ATENÇÃO! Cole aqui seus dados do Cloudinary e a URL do Backend
// =============================================================================
const CLOUDINARY_CLOUD_NAME = "di1axitma"; // Cole o "Cloud Name" do seu painel Cloudinary
const CLOUDINARY_UPLOAD_PRESET = "ml_default";
const BACKEND_URL = "https://whatsapp-backend-km3f.onrender.com";


// --- Selecionando os elementos da página ---
const form = document.getElementById('campanha-form');
const mensagemTextarea = document.getElementById('mensagem');
const imagemInput = document.getElementById('imagem-input');
const numerosTextarea = document.getElementById('numeros');
const enviarBtn = document.getElementById('enviar-btn');
const feedbackDiv = document.getElementById('feedback-envio');


form.addEventListener('submit', async function(event) {
    event.preventDefault(); 
    const mensagem = mensagemTextarea.value.trim();
    const numeros = numerosTextarea.value.trim().split('\n').filter(n => n);
    const imagemArquivo = imagemInput.files[0];

    if (!mensagem || numeros.length === 0) {
        adicionarLog('Por favor, preencha a mensagem e a lista de números.', 'error');
        return;
    }
    
    enviarBtn.disabled = true;
    enviarBtn.textContent = 'Enviando...';
    feedbackDiv.innerHTML = ''; 
    
    let imageUrl = null;
    if (imagemArquivo) {
        adicionarLog('Fazendo upload da imagem para a nuvem...');
        try {
            imageUrl = await uploadImagemParaCloudinary(imagemArquivo);
            adicionarLog(`Upload da imagem concluído: ${imageUrl}`, 'success');
        } catch (error) {
            adicionarLog(`Falha no upload da imagem: ${error.message}`, 'error');
            enviarBtn.disabled = false;
            enviarBtn.textContent = 'Enviar Campanha';
            return;
        }
    }

    adicionarLog(`Iniciando campanha para ${numeros.length} número(s).`);

    for (const numero of numeros) {
        adicionarLog(`Tentando enviar para ${numero}...`);
        try {
            await enviarMensagemParaBackend(numero, mensagem, imageUrl);
            adicionarLog(`--> Sucesso: Pedido para ${numero} foi aceito pelo servidor.`, 'success');
        } catch (error) {
            adicionarLog(`--> Falha: Erro ao enviar para ${numero}. Detalhes: ${error.message}`, 'error');
        }
        
        const delayAleatorio = Math.floor(Math.random() * (25000 - 8000 + 1) + 8000);
        adicionarLog(`Aguardando ${(delayAleatorio / 1000).toFixed(1)} segundos...`, 'info-small');
        await new Promise(resolve => setTimeout(resolve, delayAleatorio));
    }

    adicionarLog('Campanha finalizada!');
    enviarBtn.disabled = false;
    enviarBtn.textContent = 'Enviar Campanha';
});

async function uploadImagemParaCloudinary(arquivo) {
    const formData = new FormData();
    formData.append('file', arquivo);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

    const cloudinaryUrl = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

    const response = await fetch(cloudinaryUrl, {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error.message || 'Erro desconhecido no Cloudinary');
    }
    
    const data = await response.json();
    return data.secure_url;
}

async function enviarMensagemParaBackend(numero, mensagem, imagemUrl = null) {
    const endpoint = `${BACKEND_URL}/enviar-teste`;
    const payload = {
        numero: numero.trim(),
        mensagem: mensagem,
        imagem_url: imagemUrl
    };
    
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const errorData = await response.json();
        const errorMessage = errorData.detail || JSON.stringify(errorData);
        throw new Error(errorMessage);
    }
    return response.json();
}

function adicionarLog(texto, tipo = 'info') {
    const logElement = document.createElement('div');
    logElement.textContent = texto;
    logElement.className = `log ${tipo}`;
    if(tipo === 'info-small') {
        logElement.style.fontSize = '0.8em';
        logElement.style.color = '#7f8c8d';
    }
    feedbackDiv.appendChild(logElement);
    feedbackDiv.scrollTop = feedbackDiv.scrollHeight; 
}