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

// Criar tabela de agendamentos e tabela de serviços se não existirem
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS agendamentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente TEXT,
      servico TEXT,
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
});

// --- ROTAS DA API DE AGENDAMENTOS ---

// 1. Listar todos os agendamentos
app.get('/api/agendamentos', (req, res) => {
  db.all('SELECT * FROM agendamentos ORDER BY data DESC, horario ASC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// 2. Criar novo agendamento
app.post('/api/agendamentos', (req, res) => {
  const { cliente, servico, barbeiro, data, horario, preco } = req.body;
  
  const query = `INSERT INTO agendamentos (cliente, servico, barbeiro, data, horario, status, preco) VALUES (?, ?, ?, ?, ?, 'Agendado', ?)`;
  db.run(query, [cliente, servico, barbeiro, data, horario, preco || 0], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ id: this.lastID, status: 'Agendado' });
  });
});

// 3. Atualizar status de um agendamento (Concluído / Cancelado)
app.put('/api/agendamentos/:id', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  db.run('UPDATE agendamentos SET status = ? WHERE id = ?', [status, id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ updated: this.changes });
  });
});

// 4. Limpar/Deletar agendamentos
app.delete('/api/agendamentos', (req, res) => {
  db.run('DELETE FROM agendamentos', [], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ message: 'Agenda limpa com sucesso' });
  });
});

// --- ROTAS DA API DE SERVIÇOS ---

// 1. Listar todos os serviços
app.get('/api/servicos', (req, res) => {
  db.all('SELECT * FROM servicos ORDER BY id DESC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// 2. Criar novo serviço (com verificação para evitar duplicados por nome)
app.post('/api/servicos', (req, res) => {
  const { nome, preco } = req.body;

  if (!nome || !preco) {
    return res.status(400).json({ error: 'Nome e preço são obrigatórios.' });
  }

  const nomeFormatado = nome.trim();

  // Verifica se o serviço com mesmo nome já existe
  db.get('SELECT * FROM servicos WHERE LOWER(nome) = LOWER(?)', [nomeFormatado], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (row) {
      // Se já existe, atualiza o valor do serviço existente em vez de duplicar
      db.run('UPDATE servicos SET preco = ? WHERE id = ?', [preco, row.id], function(err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json({ id: row.id, nome: row.nome, preco, updated: true });
      });
    } else {
      // Se não existe, cria um novo
      db.run('INSERT INTO servicos (nome, preco) VALUES (?, ?)', [nomeFormatado, preco], function(err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.status(201).json({ id: this.lastID, nome: nomeFormatado, preco });
      });
    }
  });
});

// 3. Atualizar serviço por ID
app.put('/api/servicos/:id', (req, res) => {
  const { id } = req.params;
  const { nome, preco } = req.body;

  if (!nome || !preco) {
    return res.status(400).json({ error: 'Nome e preço são obrigatórios.' });
  }

  db.run('UPDATE servicos SET nome = ?, preco = ? WHERE id = ?', [nome.trim(), preco, id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ id, nome: nome.trim(), preco, updated: this.changes });
  });
});

// 4. Excluir um serviço por ID
app.delete('/api/servicos/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM servicos WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ message: 'Serviço removido com sucesso', deleted: this.changes });
  });
});

// --- ROTAS DE PÁGINAS ---

app.get('/painel', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'painel.html'));
});

app.get('/servicos', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'servicos.html'));
});

// Redirecionamento padrão para o index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});