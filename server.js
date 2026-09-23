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
let db = new sqlite3.Database('./barbearia.db', (err) => {
  if (err) {
    console.error('Erro ao conectar ao SQLite:', err.message);
  } else {
    console.log('Conectado ao banco de dados SQLite.');
  }
});

// Função para criar/inicializar as tabelas
function initDb() {
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
        preco REAL,
        servicoId INTEGER
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
}

// Cria as tabelas na inicialização do servidor
initDb();

// --- ROTAS DA API DE AGENDAMENTOS ---

// Listar todos os agendamentos
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

// Criar novo agendamento
app.post('/api/agendamentos', (req, res) => {
  const {
    cliente, clienteNome, nome,
    whatsapp, clienteWhatsapp,
    servico, servicoNome,
    barbeiro, barbeiroNome,
    data, horario, hora,
    preco, servicoId
  } = req.body;

  const nomeCliente = cliente || clienteNome || nome || 'Cliente';
  const telWhatsapp = whatsapp || clienteWhatsapp || '';
  const nomeServico = servico || servicoNome || 'Serviço';
  const nomeBarbeiro = barbeiro || barbeiroNome || 'Barbeiro';
  const horaAgendamento = horario || hora || '--:--';
  const idServico = servicoId || 1;

  const query = `
    INSERT INTO agendamentos (cliente, whatsapp, servico, barbeiro, data, horario, status, preco, servicoId)
    VALUES (?, ?, ?, ?, ?, ?, 'Agendado', ?, ?)
  `;

  db.run(
    query,
    [nomeCliente, telWhatsapp, nomeServico, nomeBarbeiro, data, horaAgendamento, preco || 0, idServico],
    function (err) {
      if (err) {
        console.error('Erro ao inserir agendamento:', err.message);
        return res.status(500).json({ error: err.message });
      }
      res.json({ id: this.lastID, status: 'Agendado', success: true });
    }
  );
});

// Atualizar status de um agendamento
const atualizarStatusHandler = (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({ error: 'Status é obrigatório.' });
  }

  db.run('UPDATE agendamentos SET status = ? WHERE id = ?', [status, id], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ id, status, updated: this.changes, success: true });
  });
};

app.put('/api/agendamentos/:id', atualizarStatusHandler);
app.patch('/api/agendamentos/:id/status', atualizarStatusHandler);
app.patch('/api/agendamentos/:id', atualizarStatusHandler);

// Eliminar agendamentos
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

// --- ROTAS DA API DE SERVIÇOS ---

app.get('/api/servicos', (req, res) => {
  db.all('SELECT * FROM servicos ORDER BY id DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.post('/api/servicos', (req, res) => {
  const { nome, preco } = req.body;

  if (!nome || !preco) {
    return res.status(400).json({ error: 'Nome e preço são obrigatórios.' });
  }

  const nomeFormatado = nome.trim();

  db.get('SELECT * FROM servicos WHERE LOWER(nome) = LOWER(?)', [nomeFormatado], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });

    if (row) {
      db.run('UPDATE servicos SET preco = ? WHERE id = ?', [preco, row.id], function (err) {
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

app.put('/api/servicos/:id', (req, res) => {
  const { id } = req.params;
  const { nome, preco } = req.body;

  if (!nome || !preco) {
    return res.status(400).json({ error: 'Nome e preço são obrigatórios.' });
  }

  db.run('UPDATE servicos SET nome = ?, preco = ? WHERE id = ?', [nome.trim(), preco, id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id, nome: nome.trim(), preco, updated: this.changes });
  });
});

app.delete('/api/servicos/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM servicos WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Serviço removido com sucesso', deleted: this.changes });
  });
});

// ROTA DE RESET SEGURA (Limpa as tabelas sem fechar a conexão do SQLite)
app.get('/reset-db', (req, res) => {
  db.serialize(() => {
    db.run('DROP TABLE IF EXISTS agendamentos');
    db.run('DROP TABLE IF EXISTS servicos');
    initDb();
  });
  res.send('Banco de dados resetado e recriado com sucesso! Agora você já pode agendar normalmente.');
});

// --- ROTAS DE PÁGINAS ---

app.get('/painel', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'painel.html'));
});

app.get('/servicos', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'servicos.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});