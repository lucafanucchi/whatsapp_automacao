// =============================================================================
// --- CONFIGURAÇÃO PRINCIPAL ---
// =============================================================================

const BACKEND_URL = "https://whatsapp-backend-km3f.onrender.com"; // Sua URL de produção
const urlParams = new URLSearchParams(window.location.search);
const INSTANCE_NAME = urlParams.get('instancia');

// =============================================================================
// --- SELEÇÃO DE ELEMENTOS DO DOM ---
// =============================================================================

const telaConexao = document.getElementById('tela-conexao');
const telaPrincipal = document.getElementById('tela-principal');
const qrCodeWrapper = document.getElementById('qrcode-wrapper') || document.getElementById('qrcode-container');
const statusConexaoDiv = document.getElementById('status-conexao');
const stuckContainer = document.getElementById('stuck-container');
const forceRefreshBtn = document.getElementById('force-refresh-btn');
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
const toggleHistoryBtn = document.getElementById('toggle-history-btn');
const historySection = document.getElementById('history-section');

// =============================================================================
// --- GERENCIAMENTO DE ESTADO E INICIALIZAÇÃO ---
// =============================================================================

let statusPollingInterval = null;

document.addEventListener('DOMContentLoaded', () => {
    if (!INSTANCE_NAME) {
        document.body.innerHTML = '<h1 style="font-family: sans-serif; text-align: center; margin-top: 50px; color: red;">Solicite a sua instância Whatsapp para a Digital Six para utilizar nosso serviço</h1>';
        throw new Error("Instância não definida na URL.");
    }
    verificarStatusInicial();
});


// =============================================================================
// --- LÓGICA DE CONEXÃO CORRETA E FINAL ---
// =============================================================================

async function verificarStatusInicial() {
    try {
        adicionarLog('Verificando status da conexão...', 'info-small');
        const response = await fetch(`${BACKEND_URL}/conectar/status/${INSTANCE_NAME}`);
        const data = await response.json();

        if (data.status === 'open') {
            // Se já estiver conectado, mostra o painel principal.
            mostrarTelaPrincipal();
        } else {
            // Se não estiver conectado, inicia o processo de conexão com QR Code.
            mostrarTelaDeConexao();
            iniciarProcessoDeConexao();
        }
    } catch (error) {
        console.error("Erro crítico ao verificar status inicial:", error);
        statusConexaoDiv.innerHTML = '<span style="color: red;">Falha ao conectar ao servidor do backend.</span>';
        mostrarTelaDeConexao();
    }
}

async function iniciarProcessoDeConexao() {
    try {
        statusConexaoDiv.textContent = 'Gerando QR Code, por favor aguarde...';
        qrCodeWrapper.innerHTML = ''; 
        const response = await fetch(`${BACKEND_URL}/conectar/qr-code/${INSTANCE_NAME}`);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Falha ao buscar QR Code do servidor.');
        }
        
        const data = await response.json();
        
        if (data && data.base64) {
            const qrImage = document.createElement('img');
            qrImage.src = data.base64;
            qrImage.alt = "QR Code do WhatsApp";
            qrImage.style.width = "250px";
            qrImage.style.height = "250px";
            qrCodeWrapper.appendChild(qrImage);

            statusConexaoDiv.textContent = 'QR Code pronto! Escaneie com seu celular.';
            comecarPollingDeStatus();
        } else {
            throw new Error('A API não retornou os dados do QR Code.');
        }

    } catch (error) {
        console.error("Erro no processo de conexão:", error);
        statusConexaoDiv.innerHTML = `<span style="color: red;">Erro ao gerar QR Code: ${error.message}</span>`;
        stuckContainer.style.display = 'block'; 
    }
}

function comecarPollingDeStatus() {
    if (statusPollingInterval) clearInterval(statusPollingInterval);
    statusPollingInterval = setInterval(async () => {
        try {
            const response = await fetch(`${BACKEND_URL}/conectar/status/${INSTANCE_NAME}`);
            const data = await response.json();
            if (data.status === 'open') {
                mostrarTelaPrincipal();
            }
        } catch (error) {
            console.error("Erro no polling de status:", error);
        }
    }, 5000);
}

// =============================================================================
// --- LÓGICA DE LOGOUT E ENVIO (JÁ ESTAVAM CORRETAS) ---
// =============================================================================

async function executarLogout() {
    if (!confirm("Tem certeza que deseja desconectar a sessão atual do WhatsApp?")) return;
    this.disabled = true;
    this.textContent = 'Desconectando...';
    try {
        const response = await fetch(`${BACKEND_URL}/conectar/logout/${INSTANCE_NAME}`, { method: 'POST' }); // Pode ser POST ou DELETE
        if (!response.ok) throw new Error('Falha ao processar o logout no servidor.');
        adicionarLog('Desconectado com sucesso!', 'success');
        verificarStatusInicial(); // Reinicia o ciclo, que mostrará a tela de conexão
    } catch (error) {
        alert(`Erro ao desconectar: ${error.message}`);
    } finally {
        this.disabled = false;
        this.textContent = this.id.includes('principal') ? 'Desconectar' : 'Forçar Nova Sessão';
    }
}

logoutBtnPrincipal.addEventListener('click', executarLogout);
forceRefreshBtn.addEventListener('click', executarLogout);


// =============================================================================
// --- LÓGICA DE ENVIO DE CAMPANHA (ADAPTADA) ---
// =============================================================================

form.addEventListener('submit', async function (event) {
    event.preventDefault();
    let mensagem = mensagemTextarea.value.trim();
    const numerosTextoCompleto = numerosTextarea.value.trim();
    
    // Processa a lista de contatos como antes
    const contatos = numerosTextoCompleto.split('\n').filter(line => line.trim() !== '').map(line => {
        const parts = line.split(',');
        return {
            numero: parts[0] ? parts[0].trim() : '',
            nome: parts[1] ? parts[1].trim() : ''
        };
    });

    const anexoArquivo = anexoInput.files[0];

    if ((!mensagem && !anexoArquivo) || contatos.length === 0) {
        adicionarLog('É necessário ter uma mensagem ou um anexo, e uma lista de contatos.', 'error');
        return;
    }

    if (numerosTextoCompleto) {
        localStorage.setItem('listaNumerosSalva', numerosTextoCompleto);
    }

    enviarBtn.disabled = true;
    enviarBtn.textContent = 'Enviando...';
    feedbackDiv.innerHTML = ''; // Limpa o log antigo
    
    let anexoKey = null;
    if (anexoArquivo) {
        adicionarLog('Fazendo upload do anexo...');
        try {
            anexoKey = await uploadAnexoParaR2(anexoArquivo);
            adicionarLog('Upload concluído com sucesso!', 'success');
        } catch (error) {
            adicionarLog(`Falha no upload: ${error.message}`, 'error');
            enviarBtn.disabled = false;
            enviarBtn.textContent = 'Enviar Campanha';
            return;
        }
    }

    // Monta o payload completo da campanha
    const campanhaPayload = {
        contatos: contatos,
        mensagem: mensagem,
        anexo_key: anexoKey,
        mime_type: anexoArquivo ? anexoArquivo.type : null,
        original_file_name: anexoArquivo ? anexoArquivo.name : null
    };

    // Envia a campanha INTEIRA para o backend em uma única chamada
    adicionarLog('Enviando campanha para o servidor para processamento em segundo plano...');
    try {
        // 1. Inicia a campanha no backend e pega o ID
        adicionarLog('Iniciando campanha no servidor...');
        const response = await fetch(`${BACKEND_URL}/campanhas/enviar/${INSTANCE_NAME}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(campanhaPayload),
        });
        if (!response.ok) throw new Error('Falha ao iniciar campanha no backend.');
        
        const result = await response.json();
        const campaignId = result.campaign_id;
        adicionarLog(`Campanha iniciada com ID: ${campaignId}. Acompanhando envios...`, 'success');

        // 2. Inicia o polling para acompanhar o progresso
        acompanharProgressoCampanha(campaignId, contatos.length);

    } catch (error) {
        adicionarLog(`Erro: ${error.message}`, 'error');
        enviarBtn.disabled = false;
        enviarBtn.textContent = 'Enviar Campanha';
    }
});

// --- NOVA FUNÇÃO DE ACOMPANHAMENTO ---
function acompanharProgressoCampanha(campaignId) {
    let ultimaAcaoExibida = ''; // Guarda a última mensagem para evitar repetição

    const pollingInterval = setInterval(async () => {
        try {
            const response = await fetch(`${BACKEND_URL}/campanhas/status/${campaignId}`);
            if (!response.ok){ 
                clearInterval(pollingInterval);
                return;
            }
            const status = await response.json();

            // Lógica para exibir o log detalhado passo a passo
            if (status.lastAction && status.lastAction !== ultimaAcaoExibida) {
                
                let logType = 'info-small'; // Padrão para logs de progresso
                if (status.lastAction.includes('Sucesso')) {
                    logType = 'success';
                } else if (status.lastAction.includes('Falha')) {
                    logType = 'error';
                } else if (status.lastAction.includes('finalizada')) {
                    logType = 'info';
                }
                
                adicionarLog(status.lastAction, logType);
                ultimaAcaoExibida = status.lastAction;
            }

            // Se a campanha terminou, para o polling
            if (status.status.startsWith("Finalizada")) {
                clearInterval(pollingInterval);
                enviarBtn.disabled = false;
                enviarBtn.textContent = 'Enviar Campanha';
                anexoInput.value = ''; // Limpa o anexo
                carregarHistoricoDeCampanhas();
            }

        } catch (error) {
            console.error("Erro no polling de status:", error);
            clearInterval(pollingInterval);
        }
    }, 2000); // Verifica o status a cada 2 segundos
}

async function enviarMensagemParaBackend(numero, mensagem, anexoKey = null, mimeType = null, originalFileName = null) {
    // A chamada agora inclui o INSTANCE_NAME na URL
    const endpoint = `${BACKEND_URL}/enviar/${INSTANCE_NAME}`;
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
        throw new Error(errorData.detail || 'Erro desconhecido do servidor.');
    }
    return response.json();
}

async function carregarHistoricoDeCampanhas() {
    const container = document.getElementById('history-table-container');
    container.innerHTML = '<p>Carregando histórico...</p>';

    try {
        const response = await fetch(`${BACKEND_URL}/campanhas/${INSTANCE_NAME}`);
        if (!response.ok) {
            throw new Error('Falha ao buscar histórico.');
        }

        const historico = await response.json();

        if (historico.length === 0) {
            container.innerHTML = '<p>Nenhuma atividade registrada ainda.</p>';
            return;
        }

        // Cria uma tabela para exibir os dados
        let tableHTML = `
            <style>
                .history-table { width: 100%; border-collapse: collapse; font-size: 0.9em; }
                .history-table th, .history-table td { border: 1px solid #eee; padding: 8px; text-align: left; }
                .history-table th { background-color: #f9f9f9; }
            </style>
            <table class="history-table">
                <thead>
                    <tr>
                        <th>Início</th>
                        <th>Status</th>
                        <th>Contatos</th>
                        <th>Sucessos</th>
                        <th>Falhas</th>
                    </tr>
                </thead>
                <tbody>
        `;

        historico.forEach(campanha => {
            tableHTML += `
                <tr>
                    <td>${campanha.startTime}</td>
                    <td>${campanha.status}</td>
                    <td>${campanha.totalContacts}</td>
                    <td style="color: green;">${campanha.sentCount}</td>
                    <td style="color: red;">${campanha.failedCount}</td>
                </tr>
            `;
        });

        tableHTML += '</tbody></table>';
        container.innerHTML = tableHTML;

    } catch (error) {
        container.innerHTML = `<p style="color: red;">${error.message}</p>`;
    }
}


// =============================================================================
// --- FUNÇÕES AUXILIARES E DE UI (SUA LÓGICA ORIGINAL PRESERVADA) ---
// =============================================================================

function mostrarTelaPrincipal() {
    if (statusPollingInterval) {
        clearInterval(statusPollingInterval);
        statusPollingInterval = null;
    }
    telaConexao.style.display = 'none';
    telaPrincipal.style.display = 'block';

    const listaSalva = localStorage.getItem('listaNumerosSalva');
    if (listaSalva) {
        numerosTextarea.value = listaSalva;
    }

    
}

// --- ADICIONE ESTE NOVO BLOCO DE CÓDIGO ---
// Ele controla a visibilidade do histórico
toggleHistoryBtn.addEventListener('click', () => {
    const isVisible = historySection.style.display === 'block';
    if (isVisible) {
        historySection.style.display = 'none';
    } else {
        historySection.style.display = 'block';
        carregarHistoricoDeCampanhas(); // Carrega o histórico apenas quando o usuário pede
    }
});

function mostrarTelaDeConexao() {
    telaPrincipal.style.display = 'none';
    telaConexao.style.display = 'flex';
}

function adicionarLog(texto, tipo = 'info') {
    const logElement = document.createElement('div');
    logElement.textContent = texto;
    logElement.className = `log ${tipo}`;
    feedbackDiv.appendChild(logElement);
    feedbackDiv.scrollTop = feedbackDiv.scrollHeight;
}

async function uploadAnexoParaR2(arquivo) {
    adicionarLog('Solicitando permissão de upload...', 'info-small');
    const urlResponse = await fetch(`${BACKEND_URL}/gerar-url-upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_name: arquivo.name, content_type: arquivo.type }),
    });
    if (!urlResponse.ok) throw new Error('Falha ao obter URL de upload do servidor.');
    const { upload_url, object_key } = await urlResponse.json();
    adicionarLog('Enviando arquivo para a nuvem...', 'info-small');
    const uploadResponse = await fetch(upload_url, {
        method: 'PUT',
        headers: { 'Content-Type': arquivo.type },
        body: arquivo
    });
    if (!uploadResponse.ok) throw new Error('O envio do arquivo para o serviço de nuvem falhou.');
    return object_key;
}

mensagemTextarea.addEventListener('input', (event) => {
    previewMensagem.textContent = event.target.value || "Sua mensagem aparecerá aqui...";
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