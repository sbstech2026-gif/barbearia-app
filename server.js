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

// Inicialização e Auto-Migração do Banco de Dados
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS agendamentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente TEXT,
      whatsapp TEXT,
      servico TEXT,
      barbeiro TEXT,
      data TEXT,
      horario TEXT,
      status TEXT DEFAULT 'Agendado',
      preco REAL DEFAULT 0,
      servicoId INTEGER DEFAULT 1
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS servicos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      preco REAL DEFAULT 0,
      valor REAL DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS profissionais (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL
    )
  `);

  // Garante a existência de todas as colunas possíveis em bancos legados
  const colunasAgendamento = ['cliente', 'whatsapp', 'servico', 'barbeiro', 'data', 'horario', 'status', 'preco', 'servicoId'];
  colunasAgendamento.forEach(col => {
    db.run(`ALTER TABLE agendamentos ADD COLUMN ${col} TEXT`, () => {});
  });

  db.run(`ALTER TABLE servicos ADD COLUMN preco REAL DEFAULT 0`, () => {});
  db.run(`ALTER TABLE servicos ADD COLUMN valor REAL DEFAULT 0`, () => {});
});

// ==========================================
// 1. ROTAS DE AGENDAMENTOS
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

// Inserção ultra-robusta adaptável ao esquema das tabelas
app.post('/api/agendamentos', (req, res) => {
  const body = req.body || {};
  const nomeCliente = body.cliente || body.clienteNome || body.nome || 'Cliente';
  const telWhatsapp = body.whatsapp || body.clienteWhatsapp || '';
  const nomeServico = body.servico || body.servicoNome || 'Serviço';
  const nomeBarbeiro = body.barbeiro || body.barbeiroNome || 'Barbeiro';
  const dataAgendamento = body.data || '';
  const horaAgendamento = body.horario || body.hora || '--:--';
  const valorPreco = parseFloat(body.preco) || 0;
  const idServico = parseInt(body.servicoId) || 1;

  // Inspeciona colunas da tabela antes de inserir
  db.all("PRAGMA table_info(agendamentos)", [], (err, columns) => {
    if (err || !columns || columns.length === 0) {
      return res.status(500).json({ error: 'Erro ao verificar estrutura da tabela agendamentos.' });
    }

    const colNames = columns.map(c => c.name);
    const camposToInsert = [];
    const placeholders = [];
    const valores = [];

    const mapValores = {
      cliente: nomeCliente,
      clienteNome: nomeCliente,
      nome: nomeCliente,
      whatsapp: telWhatsapp,
      clienteWhatsapp: telWhatsapp,
      servico: nomeServico,
      servicoNome: nomeServico,
      barbeiro: nomeBarbeiro,
      barbeiroNome: nomeBarbeiro,
      data: dataAgendamento,
      horario: horaAgendamento,
      hora: horaAgendamento,
      status: 'Agendado',
      preco: valorPreco,
      servicoId: idServico
    };

    colNames.forEach(col => {
      if (col !== 'id' && mapValores[col] !== undefined) {
        camposToInsert.push(col);
        placeholders.push('?');
        valores.push(mapValores[col]);
      }
    });

    const sql = `INSERT INTO agendamentos (${camposToInsert.join(', ')}) VALUES (${placeholders.join(', ')})`;

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
  if (!status) return res.status(400).json({ error: 'Status é obrigatório.' });

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
      res.json({ message: 'Agendamentos limpos com sucesso', deleted: this.changes });
    });
  } else {
    db.run('DELETE FROM agendamentos', [], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Agenda limpa com sucesso' });
    });
  }
});

// ==========================================
// 2. ROTAS DE SERVIÇOS
// ==========================================

app.get('/api/servicos', (req, res) => {
  db.all('SELECT * FROM servicos ORDER BY id DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const servicosMapeados = (rows || []).map(s => ({
      id: s.id,
      nome: s.nome,
      preco: s.preco !== undefined && s.preco !== null && s.preco !== 0 ? s.preco : (s.valor || 0)
    }));
    res.json(servicosMapeados);
  });
});

app.post('/api/servicos', (req, res) => {
  const { nome, preco, valor } = req.body;
  const valorFinal = parseFloat(preco !== undefined && preco !== '' ? preco : valor) || 0;
  if (!nome) return res.status(400).json({ error: 'Nome é obrigatório.' });

  db.run('INSERT INTO servicos (nome, preco, valor) VALUES (?, ?, ?)', [nome.trim(), valorFinal, valorFinal], function (err) {
    if (err) {
      db.run('INSERT INTO servicos (nome, preco) VALUES (?, ?)', [nome.trim(), valorFinal], function (err2) {
        if (err2) return res.status(500).json({ error: err2.message });
        res.status(201).json({ id: this.lastID, nome: nome.trim(), preco: valorFinal, success: true });
      });
    } else {
      res.status(201).json({ id: this.lastID, nome: nome.trim(), preco: valorFinal, success: true });
    }
  });
});

app.put('/api/servicos/:id', (req, res) => {
  const { id } = req.params;
  const { nome, preco, valor } = req.body;
  const valorFinal = parseFloat(preco !== undefined && preco !== '' ? preco : valor) || 0;

  db.run('UPDATE servicos SET nome = ?, preco = ?, valor = ? WHERE id = ?', [nome.trim(), valorFinal, valorFinal, id], function (err) {
    if (err) {
      db.run('UPDATE servicos SET nome = ?, preco = ? WHERE id = ?', [nome.trim(), valorFinal, id], function (err2) {
        if (err2) return res.status(500).json({ error: err2.message });
        res.json({ id, nome: nome.trim(), preco: valorFinal, updated: true });
      });
    } else {
      res.json({ id, nome: nome.trim(), preco: valorFinal, updated: true });
    }
  });
});

app.delete('/api/servicos/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM servicos WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, deleted: this.changes });
  });
});

// ==========================================
// 3. ROTAS DE PROFISSIONAIS
// ==========================================

app.get('/api/profissionais', (req, res) => {
  db.all('SELECT * FROM profissionais ORDER BY id ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.post('/api/profissionais', (req, res) => {
  const { nome } = req.body;
  if (!nome) return res.status(400).json({ error: 'Nome é obrigatório.' });

  db.run('INSERT INTO profissionais (nome) VALUES (?)', [nome.trim()], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ id: this.lastID, nome: nome.trim(), success: true });
  });
});

app.put('/api/profissionais/:id', (req, res) => {
  const { id } = req.params;
  const { nome } = req.body;
  if (!nome) return res.status(400).json({ error: 'Nome é obrigatório.' });

  db.run('UPDATE profissionais SET nome = ? WHERE id = ?', [nome.trim(), id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id, nome: nome.trim(), updated: this.changes });
  });
});

app.delete('/api/profissionais/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM profissionais WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, deleted: this.changes });
  });
});

// ==========================================
// 4. ROTAS DE PÁGINAS
// ==========================================

app.get('/painel', (req, res) => res.sendFile(path.join(__dirname, 'public', 'painel.html')));
app.get('/servicos', (req, res) => res.sendFile(path.join(__dirname, 'public', 'servicos.html')));
app.get('/profissionais', (req, res) => res.sendFile(path.join(__dirname, 'public', 'profissionais.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));