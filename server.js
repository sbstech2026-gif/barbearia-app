const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const db = new sqlite3.Database('./barbearia.db', (err) => {
  if (err) console.error('Erro ao conectar ao SQLite:', err.message);
  else console.log('Conectado ao banco de dados SQLite.');
});

// INICIALIZAÇÃO LIMPA DO BANCO DE DADOS
db.serialize(() => {
  // Tabela de Serviços
  db.run(`
    CREATE TABLE IF NOT EXISTS servicos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      preco TEXT NOT NULL
    )
  `);

  // Tabela de Profissionais
  db.run(`
    CREATE TABLE IF NOT EXISTS profissionais (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL
    )
  `);

  // Tabela de Agendamentos (Cria se não existir)
  db.run(`
    CREATE TABLE IF NOT EXISTS agendamentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente TEXT,
      whatsapp TEXT,
      servico TEXT,
      barbeiro TEXT,
      data TEXT,
      horario TEXT,
      preco REAL DEFAULT 0,
      status TEXT DEFAULT 'Agendado'
    )
  `);

  // Garante que a coluna 'cliente' exista caso a tabela seja de versão antiga
  db.run(`ALTER TABLE agendamentos ADD COLUMN cliente TEXT`, () => {});
  db.run(`ALTER TABLE agendamentos ADD COLUMN whatsapp TEXT`, () => {});
  db.run(`ALTER TABLE agendamentos ADD COLUMN servico TEXT`, () => {});
  db.run(`ALTER TABLE agendamentos ADD COLUMN barbeiro TEXT`, () => {});
  db.run(`ALTER TABLE agendamentos ADD COLUMN status TEXT DEFAULT 'Agendado'`, () => {});
  db.run(`ALTER TABLE agendamentos ADD COLUMN preco REAL DEFAULT 0`, () => {});
});

// ==========================================
// ROTAS DE SERVIÇOS
// ==========================================
app.get('/api/servicos', (req, res) => {
  db.all('SELECT rowid as id, * FROM servicos ORDER BY rowid DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.post('/api/servicos', (req, res) => {
  const { nome, preco } = req.body;
  if (!nome || !preco) {
    return res.status(400).json({ error: 'Nome e preço são obrigatórios.' });
  }

  db.run('INSERT INTO servicos (nome, preco) VALUES (?, ?)', [nome, preco], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, nome, preco, success: true });
  });
});

app.delete('/api/servicos/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM servicos WHERE rowid = ? OR id = ?', [id, id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, message: 'Serviço removido.' });
  });
});

// ==========================================
// ROTAS DE PROFISSIONAIS
// ==========================================
app.get('/api/profissionais', (req, res) => {
  db.all('SELECT rowid as id, * FROM profissionais ORDER BY rowid DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.post('/api/profissionais', (req, res) => {
  const { nome } = req.body;
  if (!nome) {
    return res.status(400).json({ error: 'Nome do profissional é obrigatório.' });
  }

  db.run('INSERT INTO profissionais (nome) VALUES (?)', [nome], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, nome, success: true });
  });
});

app.delete('/api/profissionais/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM profissionais WHERE rowid = ? OR id = ?', [id, id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, message: 'Profissional removido.' });
  });
});

// ==========================================
// ROTAS DE AGENDAMENTOS
// ==========================================
app.get('/api/agendamentos', (req, res) => {
  const { data } = req.query;

  let query = 'SELECT rowid as id, * FROM agendamentos';
  let params = [];

  if (data) {
    let dataBR = data;
    if (data.includes('-')) {
      const partes = data.split('-');
      if (partes.length === 3) dataBR = `${partes[2]}/${partes[1]}/${partes[0]}`;
    }
    query += ' WHERE data = ? OR data = ? ORDER BY horario ASC';
    params = [data, dataBR];
  } else {
    query += ' ORDER BY data DESC, horario ASC';
  }

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.post('/api/agendamentos', (req, res) => {
  const body = req.body || {};

  const cliente = body.cliente || body.clienteNome || body.nome || 'Cliente';
  const whatsapp = body.whatsapp || body.clienteWhatsapp || '';
  const servico = body.servico || body.servicoNome || 'Serviço';
  const barbeiro = body.barbeiro || body.barbeiroNome || 'Barbeiro';
  const horario = body.horario || body.hora || '--:--';
  const data = body.data || new Date().toISOString().split('T')[0];
  const preco = parseFloat(body.preco) || 0;
  const status = body.status || 'Agendado';

  const sql = `INSERT INTO agendamentos (cliente, whatsapp, servico, barbeiro, data, horario, preco, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
  
  db.run(sql, [cliente, whatsapp, servico, barbeiro, data, horario, preco, status], function (err) {
    if (err) {
      console.error("Erro no INSERT de agendamento:", err.message);
      return res.status(500).json({ error: err.message });
    }
    res.json({ id: this.lastID, status, success: true });
  });
});

// ALTERAR STATUS (CONCLUIR / CANCELAR)
const atualizarStatus = (req, res) => {
  const targetId = req.params.id || req.body.id;
  const novoStatus = req.body.status || 'Concluido';

  if (targetId && targetId !== 'undefined' && targetId !== 'null') {
    const sql = `UPDATE agendamentos SET status = ? WHERE rowid = ? OR id = ?`;
    db.run(sql, [novoStatus, targetId, targetId], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      return res.json({ success: true, status: novoStatus, changes: this.changes });
    });
  } else {
    return res.status(400).json({ error: 'ID do agendamento não informado.' });
  }
};

app.put('/api/agendamentos/:id', atualizarStatus);
app.put('/api/agendamentos', atualizarStatus);
app.patch('/api/agendamentos/:id', atualizarStatus);

app.delete('/api/agendamentos', (req, res) => {
  const { data } = req.query;

  if (data) {
    let dataBR = data;
    if (data.includes('-')) {
      const partes = data.split('-');
      if (partes.length === 3) dataBR = `${partes[2]}/${partes[1]}/${partes[0]}`;
    }

    db.run('DELETE FROM agendamentos WHERE data = ? OR data = ?', [data, dataBR], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Agendamentos removidos', deleted: this.changes });
    });
  } else {
    db.run('DELETE FROM agendamentos', [], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Agenda limpa com sucesso' });
    });
  }
});

// ROTAS DE PÁGINAS HTML
app.get('/painel', (req, res) => res.sendFile(path.join(__dirname, 'public', 'painel.html')));
app.get('/servicos', (req, res) => res.sendFile(path.join(__dirname, 'public', 'servicos.html')));
app.get('/profissionais', (req, res) => res.sendFile(path.join(__dirname, 'public', 'profissionais.html')));
app.get('/financeiro', (req, res) => res.sendFile(path.join(__dirname, 'public', 'financeiro.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));