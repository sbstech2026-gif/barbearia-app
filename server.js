const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware para processar JSON e formulários
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir arquivos estáticos da pasta 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Conectar ao Banco de Dados SQLite
const db = new sqlite3.Database('./barbearia.db', (err) => {
  if (err) {
    console.error('Erro ao conectar ao SQLite:', err.message);
  } else {
    console.log('Conectado ao banco de dados SQLite.');
  }
});

// Criar tabelas se não existirem
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS agendamentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente TEXT,
      clienteNome TEXT,
      nome TEXT,
      whatsapp TEXT,
      clienteWhatsapp TEXT,
      servico TEXT,
      servicoId INTEGER,
      barbeiro TEXT,
      data TEXT,
      horario TEXT,
      status TEXT DEFAULT 'Agendado',
      preco REAL
    )
  `);

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
// ROTAS DA API DE PROFISSIONAIS
// ==========================================

// Listar profissionais
app.get('/api/profissionais', (req, res) => {
  db.all('SELECT * FROM profissionais ORDER BY id DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

// Cadastrar profissional
app.post('/api/profissionais', (req, res) => {
  const { nome } = req.body;
  if (!nome) return res.status(400).json({ error: 'Nome é obrigatório.' });

  const nomeFormatado = nome.trim();
  db.run('INSERT INTO profissionais (nome) VALUES (?)', [nomeFormatado], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ id: this.lastID, nome: nomeFormatado });
  });
});

// Editar profissional
app.put('/api/profissionais/:id', (req, res) => {
  const { id } = req.params;
  const { nome } = req.body;
  if (!nome) return res.status(400).json({ error: 'Nome é obrigatório.' });

  db.run('UPDATE profissionais SET nome = ? WHERE id = ?', [nome.trim(), id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id, nome: nome.trim(), updated: this.changes });
  });
});

// Excluir profissional
app.delete('/api/profissionais/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM profissionais WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Profissional removido com sucesso', deleted: this.changes });
  });
});

// ==========================================
// ROTAS DE OUTRAS APIS (Agendamentos e Serviços)
// ==========================================

app.get('/api/agendamentos', (req, res) => {
  const { data } = req.query;
  if (data) {
    let dataBR = data;
    if (data.includes('-')) {
      const partes = data.split('-');
      if (partes.length === 3) dataBR = `${partes[2]}/${partes[1]}/${partes[0]}`;
    }
    db.all('SELECT * FROM agendamentos WHERE data = ? OR data = ? ORDER BY horario ASC', [data, dataBR], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    });
  } else {
    db.all('SELECT * FROM agendamentos ORDER BY data DESC, horario ASC', [], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    });
  }
});

app.post('/api/agendamentos', (req, res) => {
  const { cliente, clienteNome, nome, whatsapp, clienteWhatsapp, servico, servicoNome, servicoId, barbeiro, barbeiroNome, data, horario, hora, preco } = req.body;
  const valorNome = cliente || clienteNome || nome || 'Cliente';
  const valorWhatsapp = whatsapp || clienteWhatsapp || '';
  const valorServico = servico || servicoNome || 'Serviço';
  const valorServicoId = servicoId || 1;
  const valorBarbeiro = barbeiro || barbeiroNome || 'Barbeiro';
  const valorHorario = horario || hora || '--:--';
  const valorPreco = preco || 0;

  db.run(
    `INSERT INTO agendamentos (cliente, clienteNome, nome, whatsapp, clienteWhatsapp, servico, servicoId, barbeiro, data, horario, status, preco) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Agendado', ?)`,
    [valorNome, valorNome, valorNome, valorWhatsapp, valorWhatsapp, valorServico, valorServicoId, valorBarbeiro, data, valorHorario, valorPreco],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, status: 'Agendado', success: true });
    }
  );
});

app.get('/api/servicos', (req, res) => {
  db.all('SELECT * FROM servicos ORDER BY id DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

// ==========================================
// ROTAS DE PAGINAS (HTML)
// ==========================================

app.get('/painel', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'painel.html'));
});

app.get('/servicos', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'servicos.html'));
});

app.get('/profissionais', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'profissionais.html'));
});

app.get('/financeiro', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'financeiro.html'));
});

// Rota padrão (deve ser a última)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Inicialização do Servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});