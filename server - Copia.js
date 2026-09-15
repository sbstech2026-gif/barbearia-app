const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'))); // Servir arquivos estáticos (HTML/CSS/JS)

// -------------------------------------------------------------
// BANCO DE DADOS (Simulação em Memória)
// Em produção, substitua estas variáveis por consultas ao Banco de Dados.
// -------------------------------------------------------------
const SERVICOS = [
  { id: '1', nome: 'Corte Social / Degradê', preco: 45.00 },
  { id: '2', nome: 'Barba Completa', preco: 35.00 },
  { id: '3', nome: 'Combo (Corte + Barba)', preco: 70.00 },
  { id: '4', nome: 'Sobrancelha', preco: 15.00 }
];

const BARBEIROS = [
  { id: '1', nome: 'Carlos (Mestre Barbeiro)' },
  { id: '2', nome: 'Lucas Barber' },
  { id: '3', nome: 'Mateus Silva' }
];

// Grade padrão de atendimento da barbearia
const GRADE_HORARIOS = [
  '08:00', '09:00', '10:00', '11:00', '12:00', 
  '13:00', '14:00', '15:00', '16:00', '17:00', 
  '18:00', '19:00', '20:00'
];

// Armazenamento de agendamentos
let agendamentos = [];

// Número de WhatsApp da Barbearia para onde as confirmações serão enviadas (Apenas números)
const WHATSAPP_BARBEARIA = '5549988727098'; // Ajuste com DDD + Número

// -------------------------------------------------------------
// ROTAS DA API
// -------------------------------------------------------------

/**
 * 1. Rota para carregar Serviços e Barbeiros
 */
app.get('/api/dados-iniciais', (req, res) => {
  try {
    res.json({
      servicos: SERVICOS,
      barbeiros: BARBEIROS
    });
  } catch (error) {
    res.status(500).json({ erro: 'Erro interno ao carregar dados.' });
  }
});

/**
 * 2. Rota para buscar Horários Disponíveis e Ocupados (Mapa estilo Cinema)
 */
app.get('/api/horarios-disponiveis', (req, res) => {
  try {
    const { barbeiroId, data } = req.query;

    if (!barbeiroId || !data) {
      return res.status(400).json({ erro: 'Parâmetros barbeiroId e data são obrigatórios.' });
    }

    // Busca agendamentos efetuados para essa data e barbeiro
    const agendados = agendamentos.filter(
      a => a.barbeiroId === barbeiroId && a.data === data
    );

    const horariosOcupados = agendados.map(a => a.horario);

    // Mapeia toda a grade indicando status de cada horário
    const mapaHorarios = GRADE_HORARIOS.map(horario => ({
      horario: horario,
      disponivel: !horariosOcupados.includes(horario)
    }));

    res.json({ horarios: mapaHorarios });

  } catch (error) {
    console.error('Erro ao buscar horários:', error);
    res.status(500).json({ erro: 'Erro ao consultar horários disponíveis.' });
  }
});

/**
 * 3. Rota para Confirmar o Agendamento
 */
app.post('/api/agendar', (req, res) => {
  try {
    const { servicoId, barbeiroId, data, horario, clienteNome, clienteWhatsapp } = req.body;

    // --- Validações de Entrada ---
    if (!servicoId || !barbeiroId || !data || !horario || !clienteNome || !clienteWhatsapp) {
      return res.status(400).json({ sucesso: false, erro: 'Preencha todos os campos obrigatórios.' });
    }

    const servico = SERVICOS.find(s => s.id === servicoId);
    const barbeiro = BARBEIROS.find(b => b.id === barbeiroId);

    if (!servico || !barbeiro) {
      return res.status(400).json({ sucesso: false, erro: 'Serviço ou Barbeiro inválido.' });
    }

    // --- Proteção contra Overbooking ---
    const conflito = agendamentos.some(
      a => a.barbeiroId === barbeiroId && a.data === data && a.horario === horario
    );

    if (conflito) {
      return res.status(409).json({ 
        sucesso: false, 
        erro: 'Este horário acabou de ser reservado por outro cliente. Escolha outro horário.' 
      });
    }

    // --- Salvar Agendamento ---
    const novoAgendamento = {
      id: Date.now().toString(),
      servicoId,
      servicoNome: servico.nome,
      preco: servico.preco,
      barbeiroId,
      barbeiroNome: barbeiro.nome,
      data,
      horario,
      clienteNome: clienteNome.trim(),
      clienteWhatsapp: clienteWhatsapp.trim(),
      criadoEm: new Date().toISOString()
    };

    agendamentos.push(novoAgendamento);

    // --- Gerar Link para WhatsApp ---
    const dataFormatada = data.split('-').reverse().join('/');
    const mensagemWhatsapp = `Olá! Gostaria de confirmar meu agendamento:\n\n` +
      `📌 *Serviço:* ${servico.nome}\n` +
      `👤 *Barbeiro:* ${barbeiro.nome}\n` +
      `📅 *Data:* ${dataFormatada}\n` +
      `⏰ *Horário:* ${horario}\n` +
      `💈 *Cliente:* ${clienteNome.trim()}\n` +
      `📱 *Contato:* ${clienteWhatsapp.trim()}`;

    const whatsappUrl = `https://api.whatsapp.com/send?phone=${WHATSAPP_BARBEARIA}&text=${encodeURIComponent(mensagemWhatsapp)}`;

    res.status(201).json({
      sucesso: true,
      mensagem: 'Agendamento realizado com sucesso!',
      whatsappUrl,
      agendamento: novoAgendamento
    });

  } catch (error) {
    console.error('Erro ao processar agendamento:', error);
    res.status(500).json({ sucesso: false, erro: 'Erro interno ao processar o agendamento.' });
  }
});

// Inicialização do Servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});