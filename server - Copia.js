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

app.use(geralLimiter);

const db = new Database(path.join(__dirname, 'barbearia.db'));

// Criação da Tabela de Agendamentos
db.exec(`
  CREATE TABLE IF NOT EXISTS agendamentos (
    id TEXT PRIMARY KEY,
    cliente TEXT,
    whatsapp TEXT,
    servico TEXT,
    barbeiro TEXT,
    data TEXT,
    horario TEXT,
    preco REAL,
    status TEXT DEFAULT 'agendado',
    criadoEm TEXT
  )
`);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Rota para abrir o Painel Admin
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'painel.html'));
});

// Salvar Agendamento (Vindo do index.html)
app.post('/api/agendamentos', (req, res) => {
  try {
    const { cliente, whatsapp, servico, barbeiro, data, horario, preco } = req.body;

    const id = Date.now().toString();
    const criadoEm = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO agendamentos (id, cliente, whatsapp, servico, barbeiro, data, horario, preco, status, criadoEm)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'confirmado', ?)
    `);

    stmt.run(id, cliente, whatsapp, servico, barbeiro, data, horario, preco, criadoEm);

    res.status(201).json({ sucesso: true, mensagem: 'Agendamento registrado com sucesso!' });
  } catch (error) {
    console.error('Erro ao salvar agendamento:', error);
    res.status(500).json({ sucesso: false, erro: 'Erro ao salvar no banco de dados.' });
  }
});

// Admin - Listar Agendamentos
app.get('/api/admin/agendamentos', (req, res) => {
  try {
    const { data } = req.query;
    let query = 'SELECT * FROM agendamentos';
    const params = [];

    if (data) {
      query += ' WHERE data = ? ORDER BY horario ASC';
      params.push(data);
    } else {
      query += ' ORDER BY id DESC';
    }

    const stmt = db.prepare(query);
    const agendamentos = stmt.all(...params);

    res.json({ sucesso: true, agendamentos });
  } catch (error) {
    console.error('Erro ao buscar agendamentos:', error);
    res.status(500).json({ erro: 'Erro ao consultar o banco de dados.' });
  }
});

// Admin - Relatórios e Métricas Financeiras (ATUALIZADO E COMPLETO)
app.get('/api/admin/relatorios', (req, res) => {
  try {
    const hoje = new Date().toLocaleDateString('pt-BR');

    // Soma faturamento do dia (incluindo confirmados, atendidos e agendados)
    const totalHoje = db.prepare(`
      SELECT COALESCE(SUM(preco), 0) as total 
      FROM agendamentos 
      WHERE data = ? AND status IN ('atendido', 'confirmado', 'agendado')
    `).get(hoje);

    // Soma faturamento acumulado geral
    const totalMes = db.prepare(`
      SELECT COALESCE(SUM(preco), 0) as total 
      FROM agendamentos 
      WHERE status IN ('atendido', 'confirmado', 'agendado')
    `).get();

    // Busca o barbeiro destaque
    const destaque = db.prepare(`
      SELECT barbeiro, COALESCE(SUM(preco), 0) as total_vendas 
      FROM agendamentos 
      WHERE status IN ('atendido', 'confirmado', 'agendado')
      GROUP BY barbeiro 
      ORDER BY total_vendas DESC 
      LIMIT 1
    `).get();

    // Busca o serviço mais popular
    const servicoPopular = db.prepare(`
      SELECT servico, COUNT(*) as qtd 
      FROM agendamentos 
      WHERE status IN ('atendido', 'confirmado', 'agendado')
      GROUP BY servico 
      ORDER BY qtd DESC 
      LIMIT 1
    `).get();

    res.json({
      faturamentoHoje: totalHoje ? totalHoje.total : 0,
      faturamentoMes: totalMes ? totalMes.total : 0,
      barbeiroDestaque: destaque ? destaque.barbeiro : 'Nenhum',
      vendasDestaque: destaque ? destaque.total_vendas : 0,
      servicoPopular: servicoPopular ? servicoPopular.servico.split(' (R$')[0] : 'Nenhum'
    });
  } catch (error) {
    console.error('Erro ao carregar relatórios:', error);
    res.status(500).json({ error: 'Erro ao carregar relatórios' });
  }
});

// Admin - Atualizar Status
app.patch('/api/admin/agendamentos/:id/status', (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const stmt = db.prepare('UPDATE agendamentos SET status = ? WHERE id = ?');
    stmt.run(status, id);

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
    stmt.run(id);

    res.json({ sucesso: true, mensagem: 'Agendamento removido!' });
  } catch (error) {
    console.error('Erro ao deletar agendamento:', error);
    res.status(500).json({ erro: 'Erro ao deletar do banco de dados.' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor BarberFlow rodando na porta ${PORT}`);
});