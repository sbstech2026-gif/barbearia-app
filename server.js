const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Conectar ao Banco de Dados SQLite
const db = new sqlite3.Database('./barbearia.db', (err) => {
  if (err) console.error('Erro ao conectar ao SQLite:', err.message);
  else console.log('Conectado ao banco de dados SQLite.');
});

// Inicialização e adequação automática das tabelas
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS agendamentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      servico TEXT,
      barbeiro TEXT,
      data TEXT,
      horario TEXT
    )
  `);

  // Adiciona colunas se não existirem
  const colunasParaAdicionar = [
    'cliente TEXT',
    'clienteNome TEXT',
    'nome TEXT',
    'whatsapp TEXT',
    'clienteWhatsapp TEXT',
    'servicoId INTEGER DEFAULT 1',
    'status TEXT DEFAULT "Agendado"',
    'preco REAL DEFAULT 0'
  ];

  colunasParaAdicionar.forEach((coluna) => {
    db.run(`ALTER TABLE agendamentos ADD COLUMN ${coluna}`, () => {
      // Ignora erro se a coluna já existir
    });
  });

  db.run(`
    CREATE TABLE IF NOT EXISTS servicos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      preco TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS profissionais (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL
    )
  `);
});

// ==========================================
// ROTAS DA API DE AGENDAMENTOS
// ==========================================

app.get('/api/agendamentos', (req, res) => {
  const { data } = req.query;

  if (data) {
    let dataBR = data;
    if (data.includes('-')) {
      const partes = data.split('-');
      if (partes.length === 3) dataBR = `${partes[2]}/${partes[1]}/${partes[0]}`;
    }

    db.all(
      'SELECT * FROM agendamentos WHERE data = ? OR data = ? ORDER BY horario ASC',
      [data, dataBR],
      (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
      }
    );
  } else {
    db.all('SELECT * FROM agendamentos ORDER BY data DESC, horario ASC', [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    });
  }
});

// Inserção Dinâmica e Ultra Resiliente
app.post('/api/agendamentos', (req, res) => {
  const {
    cliente, clienteNome, nome,
    whatsapp, clienteWhatsapp,
    servico, servicoNome, servicoId,
    barbeiro, barbeiroNome,
    data, horario, hora,
    preco
  } = req.body;

  const vNome = cliente || clienteNome || nome || 'Cliente';
  const vWhatsapp = whatsapp || clienteWhatsapp || '';
  const vServico = servico || servicoNome || 'Serviço';
  const vBarbeiro = barbeiro || barbeiroNome || 'Barbeiro';
  const vHorario = horario || hora || '--:--';
  const vPreco = preco || 0;
  const vServicoId = parseInt(servicoId, 10) || 1;

  // Consulta as colunas reais da tabela no momento do insert
  db.all('PRAGMA table_info(agendamentos)', [], (err, columns) => {
    if (err) return res.status(500).json({ error: err.message });

    const colunasExistentes = columns.map(c => c.name);

    // Mapeamento de campos disponíveis
    const dadosParaInserir = {};
    if (colunasExistentes.includes('cliente')) dadosParaInserir.cliente = vNome;
    if (colunasExistentes.includes('clienteNome')) dadosParaInserir.clienteNome = vNome;
    if (colunasExistentes.includes('nome')) dadosParaInserir.nome = vNome;
    if (colunasExistentes.includes('whatsapp')) dadosParaInserir.whatsapp = vWhatsapp;
    if (colunasExistentes.includes('clienteWhatsapp')) dadosParaInserir.clienteWhatsapp = vWhatsapp;
    if (colunasExistentes.includes('servico')) dadosParaInserir.servico = vServico;
    if (colunasExistentes.includes('servicoId')) dadosParaInserir.servicoId = vServicoId;
    if (colunasExistentes.includes('barbeiro')) dadosParaInserir.barbeiro = vBarbeiro;
    if (colunasExistentes.includes('data')) dadosParaInserir.data = data;
    if (colunasExistentes.includes('horario')) dadosParaInserir.horario = vHorario;
    if (colunasExistentes.includes('status')) dadosParaInserir.status = 'Agendado';
    if (colunasExistentes.includes('preco')) dadosParaInserir.preco = vPreco;

    const chaves = Object.keys(dadosParaInserir);
    const valores = Object.values(dadosParaInserir);
    const placeholders = chaves.map(() => '?').join(', ');

    const sql = `INSERT INTO agendamentos (${chaves.join(', ')}) VALUES (${placeholders})`;

    db.run(sql, valores, function (errInsert) {
      if (errInsert) {
        console.error('Erro ao inserir agendamento:', errInsert.message);
        return res.status(500).json({ error: errInsert.message });
      }
      res.json({ id: this.lastID, status: 'Agendado', success: true });
    });
  });
});

const atualizarStatusHandler = (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({ error: 'Status é obrigatório.' });
  }

  db.run('UPDATE agendamentos SET status = ? WHERE id = ?', [status, id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id, status, updated: this.changes, success: true });
  });
};

app.put('/api/agendamentos/:id', atualizarStatusHandler);
app.patch('/api/agendamentos/:id/status', atualizarStatusHandler);
app.patch('/api/agendamentos/:id', atualizarStatusHandler);

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
      res.json({ message: 'Agendamentos da data removidos com sucesso', deleted: this.changes });
    });
  } else {
    db.run('DELETE FROM agendamentos', [], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Agenda limpa com sucesso' });
    });
  }
});

// ==========================================
// ROTAS DA API DE SERVIÇOS E PROFISSIONAIS
// ==========================================

app.get('/api/servicos', (req, res) => {
  db.all('SELECT * FROM servicos ORDER BY id DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.post('/api/servicos', (req, res) => {
  const { nome, preco } = req.body;
  if (!nome || !preco) return res.status(400).json({ error: 'Nome e preço são obrigatórios.' });

  db.run('INSERT INTO servicos (nome, preco) VALUES (?, ?)', [nome.trim(), preco], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ id: this.lastID, nome: nome.trim(), preco });
  });
});

app.delete('/api/servicos/:id', (req, res) => {
  db.run('DELETE FROM servicos WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Serviço removido com sucesso', deleted: this.changes });
  });
});

app.get('/api/profissionais', (req, res) => {
  db.all('SELECT * FROM profissionais ORDER BY id DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.post('/api/profissionais', (req, res) => {
  const { nome } = req.body;
  if (!nome) return res.status(400).json({ error: 'Nome é obrigatório.' });

  db.run('INSERT INTO profissionais (nome) VALUES (?)', [nome.trim()], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ id: this.lastID, nome: nome.trim() });
  });
});

app.delete('/api/profissionais/:id', (req, res) => {
  db.run('DELETE FROM profissionais WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Profissional removido com sucesso', deleted: this.changes });
  });
});

// Rotas de Páginas
app.get('/painel', (req, res) => res.sendFile(path.join(__dirname, 'public', 'painel.html')));
app.get('/servicos', (req, res) => res.sendFile(path.join(__dirname, 'public', 'servicos.html')));
app.get('/profissionais', (req, res) => res.sendFile(path.join(__dirname, 'public', 'profissionais.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});