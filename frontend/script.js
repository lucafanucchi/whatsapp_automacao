// =============================================================================
// --- CONFIGURAÇÃO PRINCIPAL ---
// =============================================================================
const CLOUDINARY_CLOUD_NAME = "di1axitma";
const CLOUDINARY_UPLOAD_PRESET = "whatsapp_publico"; // Usando o preset correto que criamos
const BACKEND_URL = "https://whatsapp-backend-km3f.onrender.com";
const GATEWAY_URL = "https://whatsapp-gateway-a9iz.onrender.com";

// =============================================================================
// --- SELEÇÃO DE ELEMENTOS DO DOM ---
// =============================================================================
const telaConexao = document.getElementById('tela-conexao');
const telaPrincipal = document.getElementById('tela-principal');
const qrContainer = document.getElementById('qrcode-container');
const statusConexaoDiv = document.getElementById('status-conexao');
const logoutBtnConexao = document.getElementById('logout-btn');
const logoutBtnPrincipal = document.getElementById('logout-btn-principal');
const form = document.getElementById('campanha-form');
const mensagemTextarea = document.getElementById('mensagem');
const imagemInput = document.getElementById('imagem-input');
const numerosTextarea = document.getElementById('numeros');
const enviarBtn = document.getElementById('enviar-btn');
const feedbackDiv = document.getElementById('feedback-envio');
const previewImagem = document.getElementById('preview-imagem');
const previewMensagem = document.getElementById('preview-mensagem');
const previewPdfContainer = document.getElementById('preview-pdf-container');
const previewPdfFilename = document.getElementById('preview-pdf-filename');

// =============================================================================
// --- LÓGICA DE EVENTOS E ESTADO ---
// =============================================================================
let qrCodePollingInterval = null;

document.addEventListener('DOMContentLoaded', () => {
    verificarStatusInicial();
    const listaSalva = localStorage.getItem('listaNumerosSalva');
    if (listaSalva) {
        numerosTextarea.value = listaSalva;
    }
});

mensagemTextarea.addEventListener('input', (event) => {
    const texto = event.target.value;
    previewMensagem.textContent = texto || "Sua mensagem aparecerá aqui...";
});

imagemInput.addEventListener('change', (event) => {
    const arquivo = event.target.files[0];
    previewImagem.style.display = 'none';
    previewPdfContainer.style.display = 'none';
    previewImagem.src = '';
    if (arquivo) {
        if (arquivo.type === "application/pdf") {
            previewPdfFilename.textContent = arquivo.name;
            previewPdfContainer.style.display = 'flex';
        } else if (arquivo.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = function (e) {
                previewImagem.src = e.target.result;
                previewImagem.style.display = 'block';
            }
            reader.readAsDataURL(arquivo);
        }
    }
});

form.addEventListener('submit', async function (event) {
    event.preventDefault();
    const mensagem = mensagemTextarea.value.trim();
    const numerosTextoCompleto = numerosTextarea.value.trim();
    const numeros = numerosTextoCompleto.split('\n').filter(n => n);
    const anexoArquivo = imagemInput.files[0];

    if ((!mensagem && !anexoArquivo) || numeros.length === 0) {
        adicionarLog('É necessário ter uma mensagem ou uma imagem/pdf, e uma lista de números.', 'error');
        return;
    }

    if (numerosTextoCompleto) {
        localStorage.setItem('listaNumerosSalva', numerosTextoCompleto);
        adicionarLog('Lista de contatos salva para uso futuro.', 'info-small');
    }

    enviarBtn.disabled = true;
    enviarBtn.textContent = 'Enviando...';
    feedbackDiv.innerHTML = '';

    let anexoUrl = null;
    if (anexoArquivo) {
        adicionarLog('Fazendo upload do arquivo para a nuvem...');
        try {
            anexoUrl = await uploadAnexoParaCloudinary(anexoArquivo);
            adicionarLog(`Upload concluído: ${anexoUrl}`, 'success');
            const segundosDePausa = 5;
            adicionarLog(`Aguardando ${segundosDePausa} segundos para o arquivo se propagar na nuvem...`, 'info-small');
            await new Promise(resolve => setTimeout(resolve, segundosDePausa * 1000));
        } catch (error) {
            adicionarLog(`Falha no upload do arquivo: ${error.message}`, 'error');
            enviarBtn.disabled = false;
            enviarBtn.textContent = 'Enviar Campanha';
            return;
        }
    }

    adicionarLog(`Iniciando campanha para ${numeros.length} número(s).`);

    for (const numero of numeros) {
        adicionarLog(`Tentando enviar para ${numero}...`);
        try {
            await enviarMensagemParaBackend(numero, mensagem, anexoUrl, anexoArquivo ? anexoArquivo.name : null);
            adicionarLog(`--> Sucesso: Pedido para ${numero} foi aceito pelo servidor.`, 'success');
        } catch (error) {
            adicionarLog(`--> Falha: Erro ao enviar para ${numero}. Detalhes: ${error.message}`, 'error');
        }
        const delayAleatorio = Math.floor(Math.random() * (15000 - 8000 + 1) + 8000);
        adicionarLog(`Aguardando ${(delayAleatorio / 1000).toFixed(1)} segundos...`, 'info-small');
        await new Promise(resolve => setTimeout(resolve, delayAleatorio));
    }

    adicionarLog('Campanha finalizada!');
    enviarBtn.disabled = false;
    enviarBtn.textContent = 'Enviar Campanha';
});

logoutBtnConexao.addEventListener('click', executarLogout);
logoutBtnPrincipal.addEventListener('click', executarLogout);

// =============================================================================
// --- FUNÇÕES PRINCIPAIS E AUXILIARES ---
// =============================================================================

async function uploadAnexoParaCloudinary(arquivo) {
    const formData = new FormData();
    formData.append('file', arquivo);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    // VOLTANDO PARA A LÓGICA ORIGINAL: Deixar o Cloudinary detectar o tipo.
    formData.append('resource_type', 'auto');

    // Usando apenas o endpoint de imagem, que com 'resource_type: auto' é inteligente.
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

async function enviarMensagemParaBackend(numero, mensagem, anexoUrl = null, fileName = null) {
    const endpoint = `${BACKEND_URL}/enviar-teste`;
    const payload = {
        numero: numero.trim(),
        mensagem: mensagem,
        anexo_url: anexoUrl,
        file_name: fileName
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

function gerenciarVisibilidadeTelas(estaConectado) {
    if (estaConectado) {
        telaPrincipal.style.display = 'block';
        telaConexao.style.display = 'none';
        if (qrCodePollingInterval) {
            clearInterval(qrCodePollingInterval);
            qrCodePollingInterval = null;
        }
    } else {
        telaPrincipal.style.display = 'none';
        telaConexao.style.display = 'flex';
        iniciarPollingQrCode();
    }
}

async function verificarStatusInicial() {
    try {
        statusConexaoDiv.textContent = 'Verificando status do servidor...';
        const response = await fetch(`${GATEWAY_URL}/status`);
        if (!response.ok) throw new Error(`Servidor respondeu com status ${response.status}`);
        const data = await response.json();
        gerenciarVisibilidadeTelas(data.connected);
    } catch (error) {
        console.error("Erro ao verificar status inicial:", error);
        statusConexaoDiv.textContent = '❌ Servidor offline. Tentando reconectar...';
        gerenciarVisibilidadeTelas(false);
    }
}

function iniciarPollingQrCode() {
    if (qrCodePollingInterval) return;
    qrCodePollingInterval = setInterval(async () => {
        try {
            const statusResponse = await fetch(`${GATEWAY_URL}/status`);
            const statusData = await statusResponse.json();
            if (statusData.connected) {
                gerenciarVisibilidadeTelas(true);
                return;
            }
            const qrResponse = await fetch(`${GATEWAY_URL}/qr-code`);
            if (qrResponse.ok) {
                const qrData = await qrResponse.json();
                qrContainer.innerHTML = '';
                new QRCode(qrContainer, { text: qrData.qr, width: 250, height: 250 });
                statusConexaoDiv.textContent = 'Escaneie o código para conectar.';
                logoutBtnConexao.style.display = 'inline-block';
            } else {
                const qrCodeJaExibido = qrContainer.querySelector('canvas');
                if (qrCodeJaExibido) {
                    statusConexaoDiv.textContent = 'QR Code lido! Autenticando...';
                } else {
                    statusConexaoDiv.textContent = 'Aguardando QR Code do servidor...';
                }
            }
        } catch (error) {
            statusConexaoDiv.textContent = '❌ Servidor offline. Tentando reconectar...';
        }
    }, 3000);
}

async function executarLogout(event) {
    const btn = event.target;
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Desconectando...';
    try {
        await fetch(`${GATEWAY_URL}/logout`, { method: 'POST' });
        statusConexaoDiv.textContent = 'Sessão encerrada com sucesso. Recarregando...';
        setTimeout(() => window.location.reload(), 1500);
    } catch (error) {
        alert("Falha ao encerrar sessão. Verifique o console.");
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

function adicionarLog(texto, tipo = 'info') {
    const logElement = document.createElement('div');
    logElement.textContent = texto;
    logElement.className = `log ${tipo}`;
    if (tipo === 'info-small') {
        logElement.style.fontSize = '0.8em';
        logElement.style.color = '#7f8c8d';
    }
    feedbackDiv.appendChild(logElement);
    feedbackDiv.scrollTop = feedbackDiv.scrollHeight;
}