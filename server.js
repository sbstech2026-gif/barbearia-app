const express = require('express');
const cors = require('cors');
const path = require('path');
const Database = require('better-sqlite3');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet({ contentSecurityPolicy: false }));

const geralLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { erro: 'Muitas requisições. Tente novamente mais tarde.' }
});

const agendamentoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { sucesso: false, erro: 'Limite de agendamentos atingido. Aguarde 15 minutos.' }
});

app.use(geralLimiter);

const db = new Database(path.join(__dirname, 'barbearia.db'));

// Cria a tabela com a coluna status
db.exec(`
  CREATE TABLE IF NOT EXISTS agendamentos (
    id TEXT PRIMARY KEY,
    servicoId TEXT NOT NULL,
    servicoNome TEXT NOT NULL,
    preco REAL NOT NULL,
    barbeiroId TEXT NOT NULL,
    barbeiroNome TEXT NOT NULL,
    data TEXT NOT NULL,
    horario TEXT NOT NULL,
    clienteNome TEXT NOT NULL,
    clienteWhatsapp TEXT NOT NULL,
    criadoEm TEXT NOT NULL,
    status TEXT DEFAULT 'agendado'
  )
`);

// Adiciona a coluna status em bancos que já existiam sem ela
try {
  db.exec(`ALTER TABLE agendamentos ADD COLUMN status TEXT DEFAULT 'agendado'`);
} catch (e) {
  // Coluna já existe
}

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

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

const GRADE_HORARIOS = [
  '08:00', '09:00', '10:00', '11:00', '12:00', 
  '13:00', '14:00', '15:00', '16:00', '17:00', 
  '18:00', '19:00', '20:00'
];

const WHATSAPP_BARBEARIA = '5549988727098';

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'painel.html'));
});

app.get('/api/dados-iniciais', (req, res) => {
  res.json({ servicos: SERVICOS, barbeiros: BARBEIROS });
});

app.get('/api/horarios-disponiveis', (req, res) => {
  try {
    const { barbeiroId, data } = req.query;

    if (!barbeiroId || !data) {
      return res.status(400).json({ erro: 'barbeiroId e data são obrigatórios.' });
    }

    const stmt = db.prepare("SELECT horario FROM agendamentos WHERE barbeiroId = ? AND data = ? AND status != 'cancelado'");
    const agendados = stmt.all(barbeiroId, data);
    const horariosOcupados = agendados.map(a => a.horario);

    const agora = new Date();
    const ano = agora.getFullYear();
    const mes = String(agora.getMonth() + 1).padStart(2, '0');
    const dia = String(agora.getDate()).padStart(2, '0');
    const dataHoje = `${ano}-${mes}-${dia}`;

    const horaAtual = agora.getHours();
    const minutoAtual = agora.getMinutes();

    const mapaHorarios = GRADE_HORARIOS.map(horario => {
      const [horaStr, minStr] = horario.split(':');
      const horaItem = parseInt(horaStr, 10);
      const minItem = parseInt(minStr, 10);

      let jaPassou = false;
      if (data === dataHoje) {
        if (horaItem < horaAtual || (horaItem === horaAtual && minItem <= minutoAtual)) {
          jaPassou = true;
        }
      }

      const estaOcupado = horariosOcupados.includes(horario);

      return {
        horario,
        disponivel: !jaPassou && !estaOcupado
      };
    });

    res.json({ horarios: mapaHorarios });
  } catch (error) {
    console.error('Erro ao buscar horários:', error);
    res.status(500).json({ erro: 'Erro ao consultar banco de dados.' });
  }
});

app.post('/api/agendar', agendamentoLimiter, (req, res) => {
  try {
    const { servicoId, barbeiroId, data, horario, clienteNome, clienteWhatsapp } = req.body;

    if (!servicoId || !barbeiroId || !data || !horario || !clienteNome || !clienteWhatsapp) {
      return res.status(400).json({ sucesso: false, erro: 'Preencha todos os campos.' });
    }

    const servico = SERVICOS.find(s => s.id === servicoId);
    const barbeiro = BARBEIROS.find(b => b.id === barbeiroId);

    if (!servico || !barbeiro) {
      return res.status(400).json({ sucesso: false, erro: 'Serviço ou Barbeiro inválido.' });
    }

    // Validação rígida anti-conflito no servidor
    const checkStmt = db.prepare("SELECT id FROM agendamentos WHERE barbeiroId = ? AND data = ? AND horario = ? AND status != 'cancelado'");
    const conflito = checkStmt.get(barbeiroId, data, horario);

    if (conflito) {
      return res.status(409).json({ 
        sucesso: false, 
        erro: 'Este horário acabou de ser reservado por outro cliente!' 
      });
    }

    const id = Date.now().toString();
    const criadoEm = new Date().toISOString();
    
    const insertStmt = db.prepare(`
      INSERT INTO agendamentos (id, servicoId, servicoNome, preco, barbeiroId, barbeiroNome, data, horario, clienteNome, clienteWhatsapp, criadoEm, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'agendado')
    `);

    insertStmt.run(id, servicoId, servico.nome, servico.preco, barbeiroId, barbeiro.nome, data, horario, clienteNome.trim(), clienteWhatsapp.trim(), criadoEm);

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
      mensagem: 'Agendamento salvo com sucesso!',
      whatsappUrl
    });

  } catch (error) {
    console.error('Erro ao agendar:', error);
    res.status(500).json({ sucesso: false, erro: 'Erro ao salvar no banco de dados.' });
  }
});

// Admin - Listar
app.get('/api/admin/agendamentos', (req, res) => {
  try {
    const { data } = req.query;

    let query = 'SELECT * FROM agendamentos';
    const params = [];

    if (data) {
      query += ' WHERE data = ? ORDER BY horario ASC';
      params.push(data);
    } else {
      query += ' ORDER BY data DESC, horario ASC';
    }

    const stmt = db.prepare(query);
    const agendamentos = stmt.all(...params);

    res.json({ sucesso: true, agendamentos });
  } catch (error) {
    console.error('Erro ao buscar agendamentos:', error);
    res.status(500).json({ erro: 'Erro ao consultar o banco de dados.' });
  }
});

// Admin - Limpar TODOS os Agendamentos
app.post('/api/limpar-testes', (req, res) => {
  try {
    const query = "DELETE FROM agendamentos";
    const stmt = db.prepare(query);
    const resultado = stmt.run();

    res.json({ 
      sucesso: true, 
      mensagem: `Agenda limpa com sucesso! (${resultado.changes} agendamentos removidos)` 
    });
  } catch (error) {
    console.error('Erro ao limpar agenda:', error);
    res.status(500).json({ sucesso: false, erro: 'Erro ao limpar dados da agenda.' });
  }
});

// Admin - Atualizar Status (Atendido / Cancelado / Agendado)
app.patch('/api/admin/agendamentos/:id/status', (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['agendado', 'atendido', 'cancelado'].includes(status)) {
      return res.status(400).json({ sucesso: false, erro: 'Status inválido.' });
    }

    const stmt = db.prepare('UPDATE agendamentos SET status = ? WHERE id = ?');
    const resultado = stmt.run(status, id);

    if (resultado.changes === 0) {
      return res.status(404).json({ sucesso: false, erro: 'Agendamento não encontrado.' });
    }

    res.json({ sucesso: true, mensagem: `Status alterado para ${status}.` });
  } catch (error) {
    console.error('Erro ao atualizar status:', error);
    res.status(500).json({ erro: 'Erro ao atualizar no banco de dados.' });
  }
});

// Admin - Deletar registro
app.delete('/api/admin/agendamentos/:id', (req, res) => {
  try {
    const { id } = req.params;

    const stmt = db.prepare('DELETE FROM agendamentos WHERE id = ?');
    const resultado = stmt.run(id);

    if (resultado.changes === 0) {
      return res.status(404).json({ sucesso: false, erro: 'Agendamento não encontrado.' });
    }

    res.json({ sucesso: true, mensagem: 'Agendamento removido!' });
  } catch (error) {
    console.error('Erro ao deletar agendamento:', error);
    res.status(500).json({ erro: 'Erro ao deletar do banco de dados.' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`👉 Painel Admin: http://localhost:${PORT}/admin`);
});