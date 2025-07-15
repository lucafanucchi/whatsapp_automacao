// =============================================================================
// --- CONFIGURAÇÃO PRINCIPAL ---
// =============================================================================
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
const anexoInput = document.getElementById('anexo-input');
const numerosTextarea = document.getElementById('numeros');
const enviarBtn = document.getElementById('enviar-btn');
const feedbackDiv = document.getElementById('feedback-envio');
const previewImagem = document.getElementById('preview-imagem');
const previewMensagem = document.getElementById('preview-mensagem');
const previewPdfContainer = document.getElementById('preview-pdf-container');
const previewPdfFilename = document.getElementById('preview-pdf-filename');
const previewVideo = document.getElementById('preview-video');
// NOVO: Selecionando os elementos do botão de pânico
const stuckContainer = document.getElementById('stuck-container');
const forceRefreshBtn = document.getElementById('force-refresh-btn');


// =============================================================================
// --- LÓGICA DE EVENTOS E ESTADO ---
// =============================================================================
let qrCodePollingInterval = null;
let stuckDetector = null; // NOVO: Variável para controlar o timer do "pânico"

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

anexoInput.addEventListener('change', (event) => {
    const arquivo = event.target.files[0];
    previewImagem.style.display = 'none';
    previewPdfContainer.style.display = 'none';
    previewVideo.style.display = 'none';
    previewImagem.src = '';
    previewVideo.src = '';

    if (arquivo) {
        const reader = new FileReader();
        reader.onload = function (e) {
            if (arquivo.type.startsWith('image/')) {
                previewImagem.src = e.target.result;
                previewImagem.style.display = 'block';
            } else if (arquivo.type.startsWith('video/')) {
                previewVideo.src = e.target.result;
                previewVideo.style.display = 'block';
            }
        }
        if (arquivo.type.startsWith('image/') || arquivo.type.startsWith('video/')) {
             reader.readAsDataURL(arquivo);
        } else if (arquivo.type === "application/pdf") {
            previewPdfFilename.textContent = arquivo.name;
            previewPdfContainer.style.display = 'flex';
        }
    }
});

form.addEventListener('submit', async function (event) {
    event.preventDefault();
    const mensagem = mensagemTextarea.value.trim();
    const numerosTextoCompleto = numerosTextarea.value.trim();
    const numeros = numerosTextoCompleto.split('\n').filter(n => n);
    const anexoArquivo = anexoInput.files[0];
    const anexoMimeType = anexoArquivo ? anexoArquivo.type : null;
    const anexoNomeOriginal = anexoArquivo ? anexoArquivo.name : null;

    if ((!mensagem && !anexoArquivo) || numeros.length === 0) {
        adicionarLog('É necessário ter uma mensagem ou um anexo, e uma lista de números.', 'error');
        return;
    }

    if (numerosTextoCompleto) {
        localStorage.setItem('listaNumerosSalva', numerosTextoCompleto);
        adicionarLog('Lista de contatos salva para uso futuro.', 'info-small');
    }

    enviarBtn.disabled = true;
    enviarBtn.textContent = 'Enviando...';
    feedbackDiv.innerHTML = '';

    let anexoKey = null;

    if (anexoArquivo) {
        adicionarLog('Preparando upload do arquivo...');
        try {
            anexoKey = await uploadAnexoParaR2(anexoArquivo);
            adicionarLog(`Upload concluído com sucesso! Chave: ${anexoKey}`, 'success');
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
            await enviarMensagemParaBackend(numero, mensagem, anexoKey, anexoMimeType, anexoNomeOriginal);
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
// NOVO: O botão de pânico também chama a função de logout
forceRefreshBtn.addEventListener('click', executarLogout);


// =============================================================================
// --- FUNÇÕES PRINCIPAIS E AUXILIARES ---
// =============================================================================

function gerenciarVisibilidadeTelas(estaConectado) {
    // NOVO: Limpamos qualquer timer pendente ao mudar de tela
    if (stuckDetector) clearTimeout(stuckDetector);
    stuckContainer.style.display = 'none';

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

    // NOVO: Inicia um timer para detectar se a aplicação travou
    stuckDetector = setTimeout(() => {
        const qrCodeJaExibido = qrContainer.querySelector('canvas');
        if (statusConexaoDiv.textContent.includes('Aguardando') && !qrCodeJaExibido) {
            stuckContainer.style.display = 'block';
        }
    }, 25000); // Exibe o botão após 25 segundos de espera

    qrCodePollingInterval = setInterval(async () => {
        try {
            const statusResponse = await fetch(`${GATEWAY_URL}/status`);
            const statusData = await statusResponse.json();
            if (statusData.connected) {
                gerenciarVisibilidadeTelas(true); // Isso vai limpar o timer e esconder o botão
                return;
            }
            const qrResponse = await fetch(`${GATEWAY_URL}/qr-code`);
            if (qrResponse.ok) {
                // Se o QR Code chegar, limpamos o timer e garantimos que o botão de pânico suma
                if (stuckDetector) clearTimeout(stuckDetector);
                stuckContainer.style.display = 'none';

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
    
    // NOVO: Garantimos que o botão de pânico suma ao iniciar o logout
    stuckContainer.style.display = 'none';

    try {
        await fetch(`${GATEWAY_URL}/logout`, { method: 'POST' }); // Adicionei await para esperar a chamada
        if (qrCodePollingInterval) clearInterval(qrCodePollingInterval);
        if (stuckDetector) clearTimeout(stuckDetector); // Limpa o timer do pânico

        telaPrincipal.style.display = 'none';
        telaConexao.style.display = 'flex';
        qrContainer.innerHTML = '';
        statusConexaoDiv.textContent = 'Servidor reiniciando após logout. Aguarde...';
        
        // Aguarda um pouco antes de começar a verificar o status novamente
        setTimeout(() => {
             iniciarPollingQrCode();
             btn.disabled = false; // Reabilita o botão
             btn.textContent = originalText;
        }, 5000);

    } catch (error) {
        alert("Falha crítica ao tentar deslogar.");
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

async function uploadAnexoParaR2(arquivo) {
    try {
        adicionarLog('Solicitando permissão de upload...', 'info-small');
        const urlResponse = await fetch(`${BACKEND_URL}/gerar-url-upload`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                file_name: arquivo.name,
                content_type: arquivo.type
            }),
        });

        if (!urlResponse.ok) {
            throw new Error('Falha ao obter URL de upload do servidor.');
        }

        const { upload_url, object_key } = await urlResponse.json();
        
        adicionarLog('Enviando arquivo para o armazenamento na nuvem...', 'info-small');
        const uploadResponse = await fetch(upload_url, {
            method: 'PUT',
            headers: { 'Content-Type': arquivo.type },
            body: arquivo
        });

        if (!uploadResponse.ok) {
            throw new Error('O envio do arquivo para o serviço de nuvem falhou.');
        }
        return object_key;
    } catch (error) {
        console.error("Erro no upload para o R2:", error);
        throw new Error("Não foi possível enviar o arquivo. Verifique os logs do backend.");
    }
}

async function enviarMensagemParaBackend(numero, mensagem, anexoKey = null, mimeType = null, originalFileName = null) {
    const endpoint = `${BACKEND_URL}/enviar-teste`;
    const payload = {
        numero: numero.trim(),
        mensagem: mensagem,
        anexo_key: anexoKey,
        mime_type: mimeType,
        original_file_name: originalFileName
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
    if (tipo === 'info-small') {
        logElement.style.fontSize = '0.8em';
        logElement.style.color = '#7f8c8d';
    }
    feedbackDiv.appendChild(logElement);
    feedbackDiv.scrollTop = feedbackDiv.scrollHeight;
}