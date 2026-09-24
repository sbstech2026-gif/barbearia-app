const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Inicialização do Banco de Dados SQLite
const db = new sqlite3.Database('./database.db', (err) => {
  if (err) {
    console.error('Erro ao conectar ao SQLite:', err.message);
  } else {
    console.log('Conectado ao banco de dados SQLite.');
  }
});

// Criar Tabelas e Ajustar Colunas
db.serialize(() => {
  // Tabela de Serviços
  db.run(`
    CREATE TABLE IF NOT EXISTS servicos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      preco REAL NOT NULL
    )
  `);

  // Tabela de Profissionais
  db.run(`
    CREATE TABLE IF NOT EXISTS profissionais (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      especialidade TEXT,
      telefone TEXT
    )
  `);

  // Tabela de Agendamentos
  db.run(`
    CREATE TABLE IF NOT EXISTS agendamentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente TEXT NOT NULL,
      whatsapp TEXT,
      servico TEXT,
      servicoId INTEGER,
      barbeiro TEXT,
      barbeiroId INTEGER DEFAULT 1,
      data TEXT NOT NULL,
      horario TEXT NOT NULL,
      status TEXT DEFAULT 'Agendado',
      preco REAL DEFAULT 0
    )
  `, (err) => {
    if (!err) {
      // Garante que a coluna barbeiroId exista caso a tabela tenha sido criada em versão anterior
      db.run(`ALTER TABLE agendamentos ADD COLUMN barbeiroId INTEGER DEFAULT 1`, () => {});
      db.run(`ALTER TABLE agendamentos ADD COLUMN servicoId INTEGER`, () => {});
    }
  });
});

// ==========================================
// ROTAS DA API - SERVIÇOS
// ==========================================

// Listar todos os serviços
app.get('/api/servicos', (req, res) => {
  db.all('SELECT * FROM servicos ORDER BY id DESC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Cadastrar novo serviço
app.post('/api/servicos', (req, res) => {
  const { nome, preco } = req.body;
  if (!nome || preco === undefined) {
    return res.status(400).json({ error: 'Nome e preço são obrigatórios.' });
  }

  db.run('INSERT INTO servicos (nome, preco) VALUES (?, ?)', [nome, preco], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.status(201).json({ id: this.lastID, nome, preco });
  });
});

// Deletar serviço
app.delete('/api/servicos/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM servicos WHERE id = ?', [id], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true, deleted: this.changes });
  });
});

// ==========================================
// ROTAS DA API - PROFISSIONAIS
// ==========================================

// Listar todos os profissionais
app.get('/api/profissionais', (req, res) => {
  db.all('SELECT * FROM profissionais ORDER BY id DESC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Cadastrar novo profissional
app.post('/api/profissionais', (req, res) => {
  const { nome, especialidade, telefone } = req.body;
  if (!nome) {
    return res.status(400).json({ error: 'O nome do profissional é obrigatório.' });
  }

  db.run(
    'INSERT INTO profissionais (nome, especialidade, telefone) VALUES (?, ?, ?)',
    [nome, especialidade || '', telefone || ''],
    function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.status(201).json({ id: this.lastID, nome, especialidade, telefone });
    }
  );
});

// Deletar profissional
app.delete('/api/profissionais/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM profissionais WHERE id = ?', [id], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true, deleted: this.changes });
  });
});

// ==========================================
// ROTAS DA API - AGENDAMENTOS
// ==========================================

// Listar agendamentos (filtro opcional por data)
app.get('/api/agendamentos', (req, res) => {
  const { data } = req.query;

  let query = 'SELECT * FROM agendamentos';
  let params = [];

  if (data) {
    query += ' WHERE data = ?';
    params.push(data);
  }

  query += ' ORDER BY horario ASC';

  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Criar novo agendamento (Tratamento adaptativo NOT NULL para barbeiroId/servicoId)
app.post('/api/agendamentos', (req, res) => {
  const {
    cliente,
    clienteNome,
    whatsapp,
    servico,
    servicoId,
    barbeiro,
    barbeiroId,
    data,
    horario,
    preco
  } = req.body;

  const nomeCliente = cliente || clienteNome;
  const nomeBarbeiro = barbeiro || 'Geral';
  const idBarbeiro = barbeiroId || 1; // Garante ID válido caso o banco exija NOT NULL
  const nomeServico = servico || 'Serviço';
  const idServico = servicoId || 1;
  const precoFinal = preco || 0;

  if (!nomeCliente || !data || !horario) {
    return res.status(400).json({ error: 'Preencha todos os campos obrigatórios.' });
  }

  // Tenta realizar o INSERT completo
  const queryCompleta = `
    INSERT INTO agendamentos 
    (cliente, whatsapp, servico, servicoId, barbeiro, barbeiroId, data, horario, status, preco)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Agendado', ?)
  `;

  db.run(
    queryCompleta,
    [
      nomeCliente,
      whatsapp || '',
      nomeServico,
      idServico,
      nomeBarbeiro,
      idBarbeiro,
      data,
      horario,
      precoFinal
    ],
    function (err) {
      if (!err) {
        return res.status(201).json({ id: this.lastID, status: 'Agendado', success: true });
      }

      console.warn('Erro no INSERT completo, executando fallback:', err.message);

      // Fallback para versões legadas da tabela
      const queryFallback = `
        INSERT INTO agendamentos 
        (cliente, whatsapp, servico, barbeiro, barbeiroId, data, horario, status, preco)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'Agendado', ?)
      `;

      db.run(
        queryFallback,
        [
          nomeCliente,
          whatsapp || '',
          nomeServico,
          nomeBarbeiro,
          idBarbeiro,
          data,
          horario,
          precoFinal
        ],
        function (errFallback) {
          if (errFallback) {
            console.error('Erro no fallback de agendamento:', errFallback.message);
            return res.status(500).json({ error: errFallback.message });
          }
          res.status(201).json({ id: this.lastID, status: 'Agendado', success: true });
        }
      );
    }
  );
});

// Cancelar/Deletar agendamento
app.delete('/api/agendamentos/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM agendamentos WHERE id = ?', [id], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true, deleted: this.changes });
  });
});

// Rotas para páginas HTML
app.get('/painel', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'painel.html'));
});

app.get('/servicos', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'servicos.html'));
});

// Inicialização do Servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});