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

// Inicializar / Conectar Banco de Dados SQLite
const db = new sqlite3.Database('./barbearia.db', (err) => {
  if (err) {
    console.error('Erro ao conectar ao SQLite:', err.message);
  } else {
    console.log('Conectado ao banco de dados SQLite.');
  }
});

// Criar tabelas e garantir colunas necessárias
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS agendamentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente TEXT,
      whatsapp TEXT,
      servico TEXT,
      servicoId INTEGER,
      barbeiro TEXT,
      barbeiroId INTEGER,
      data TEXT,
      horario TEXT,
      preco REAL DEFAULT 0,
      status TEXT DEFAULT 'Agendado'
    )
  `);

  // Compatibilidade com bancos antigos: adiciona colunas caso faltem
  db.run(`ALTER TABLE agendamentos ADD COLUMN servicoId INTEGER`, () => {});
  db.run(`ALTER TABLE agendamentos ADD COLUMN barbeiroId INTEGER`, () => {});
  db.run(`ALTER TABLE agendamentos ADD COLUMN cliente TEXT`, () => {});
  db.run(`ALTER TABLE agendamentos ADD COLUMN whatsapp TEXT`, () => {});
  db.run(`ALTER TABLE agendamentos ADD COLUMN servico TEXT`, () => {});
  db.run(`ALTER TABLE agendamentos ADD COLUMN barbeiro TEXT`, () => {});
  db.run(`ALTER TABLE agendamentos ADD COLUMN status TEXT DEFAULT 'Agendado'`, () => {});
  db.run(`ALTER TABLE agendamentos ADD COLUMN preco REAL DEFAULT 0`, () => {});

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
// ROTAS DE SERVIÇOS
// ==========================================

// 1. Listar Serviços
app.get('/api/servicos', (req, res) => {
  db.all('SELECT rowid as id, * FROM servicos ORDER BY rowid DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

// 2. Criar ou Atualizar Serviço por Nome (Evita duplicados)
app.post('/api/servicos', (req, res) => {
  const { nome, preco } = req.body;

  if (!nome || !preco) {
    return res.status(400).json({ error: 'Nome e preço são obrigatórios.' });
  }

  const nomeFormatado = nome.trim();

  db.get('SELECT rowid as id, * FROM servicos WHERE LOWER(nome) = LOWER(?)', [nomeFormatado], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });

    if (row) {
      db.run('UPDATE servicos SET preco = ? WHERE rowid = ?', [preco, row.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: row.id, nome: row.nome, preco, updated: true });
      });
    } else {
      db.run('INSERT INTO servicos (nome, preco) VALUES (?, ?)', [nomeFormatado, preco], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ id: this.lastID, nome: nomeFormatado, preco });
      });
    }
  });
});

// 3. Editar Serviço por ID
app.put('/api/servicos/:id', (req, res) => {
  const { id } = req.params;
  const { nome, preco } = req.body;

  if (!nome || !preco) {
    return res.status(400).json({ error: 'Nome e preço são obrigatórios.' });
  }

  db.run('UPDATE servicos SET nome = ?, preco = ? WHERE rowid = ?', [nome.trim(), preco, id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id, nome: nome.trim(), preco, updated: this.changes });
  });
});

// 4. Excluir Serviço por ID
app.delete('/api/servicos/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM servicos WHERE rowid = ?', [id], function (err) {
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
  if (!nome) return res.status(400).json({ error: 'Nome do profissional é obrigatório.' });

  db.run('INSERT INTO profissionais (nome) VALUES (?)', [nome], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, nome, success: true });
  });
});

app.delete('/api/profissionais/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM profissionais WHERE rowid = ?', [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, message: 'Profissional removido.' });
  });
});

// ==========================================
// ROTAS DE AGENDAMENTOS
// ==========================================

// 1. Listar Agendamentos (com suporte a filtro por data)
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

// 2. Criar Novo Agendamento (Mapeamento Dinâmico Seguro para evitar NOT NULL constraints)
app.post('/api/agendamentos', (req, res) => {
  const body = req.body || {};

  const cliente = body.cliente || body.clienteNome || body.nome || 'Cliente';
  const whatsapp = body.whatsapp || body.clienteWhatsapp || '';
  const servico = body.servico || body.servicoNome || 'Serviço';
  const servicoId = parseInt(body.servicoId || body.servico_id) || 1;
  const barbeiro = body.barbeiro || body.barbeiroNome || 'Barbeiro';
  const barbeiroId = parseInt(body.barbeiroId || body.barbeiro_id) || 1;
  const horario = body.horario || body.hora || '--:--';
  const data = body.data || new Date().toISOString().split('T')[0];
  const preco = parseFloat(body.preco) || 0;
  const status = body.status || 'Agendado';
  const criadoEm = new Date().toISOString();

  // Consulta a estrutura exata da tabela no banco
  db.all('PRAGMA table_info(agendamentos)', [], (err, columns) => {
    if (err) return res.status(500).json({ error: err.message });

    const colNames = columns.map(c => c.name);
    const campos = [];
    const valores = [];

    const valoresMapeados = {
      cliente, nome: cliente, clienteNome: cliente,
      whatsapp, clienteWhatsapp: whatsapp,
      servico, servicoNome: servico,
      servicoId, servico_id: servicoId,
      barbeiro, barbeiroNome: barbeiro,
      barbeiroId, barbeiro_id: barbeiroId,
      data, horario, hora: horario,
      preco, status,
      criadoEm, created_at: criadoEm, createdAt: criadoEm
    };

    colNames.forEach(col => {
      if (col === 'id' || col === 'rowid') return;
      if (valoresMapeados.hasOwnProperty(col)) {
        campos.push(col);
        valores.push(valoresMapeados[col]);
      } else {
        // Coluna existente no banco mas não mapeada (schema legado):
        // envia string vazia em vez de deixar de fora, evitando erro de NOT NULL
        campos.push(col);
        valores.push('');
      }
    });

    const placeholders = campos.map(() => '?').join(', ');
    const sql = `INSERT INTO agendamentos (${campos.join(', ')}) VALUES (${placeholders})`;

    db.run(sql, valores, function (errInsert) {
      if (errInsert) return res.status(500).json({ error: errInsert.message });
      res.json({ id: this.lastID, status, success: true });
    });
  });
});

// 3. Atualizar Status do Agendamento (Concluído / Cancelado)
const atualizarStatus = (req, res) => {
  const targetId = req.params.id || req.body.id;
  const novoStatus = req.body.status || 'Concluido';

  if (targetId && targetId !== 'undefined' && targetId !== 'null') {
    // Usa apenas rowid: funciona em qualquer schema (com ou sem coluna 'id' explícita).
    // O 'id' retornado pelo GET já é o rowid ("SELECT rowid as id, *"), então é seguro.
    const sql = `UPDATE agendamentos SET status = ? WHERE rowid = ?`;
    db.run(sql, [novoStatus, targetId], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Agendamento não encontrado.' });
      }
      return res.json({ success: true, status: novoStatus, changes: this.changes });
    });
  } else {
    return res.status(400).json({ error: 'ID do agendamento não informado.' });
  }
};

app.put('/api/agendamentos/:id', atualizarStatus);
app.put('/api/agendamentos', atualizarStatus);
app.patch('/api/agendamentos/:id', atualizarStatus);

// 4. Deletar / Limpar Agendamentos
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

// ==========================================
// ROTAS DE PÁGINAS HTML
// ==========================================

app.get('/painel', (req, res) => res.sendFile(path.join(__dirname, 'public', 'painel.html')));
app.get('/servicos', (req, res) => res.sendFile(path.join(__dirname, 'public', 'servicos.html')));
app.get('/profissionais', (req, res) => res.sendFile(path.join(__dirname, 'public', 'profissionais.html')));
app.get('/financeiro', (req, res) => res.sendFile(path.join(__dirname, 'public', 'financeiro.html')));

// Redirecionamento padrão para o index.html
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Iniciar servidor
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));