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

// Inicializar / Conectar ao Banco de Dados SQLite
const db = new sqlite3.Database('./barbearia.db', (err) => {
  if (err) {
    console.error('Erro ao conectar ao SQLite:', err.message);
  } else {
    console.log('Conectado ao banco de dados SQLite.');
  }
});

// Reestruturar e migrar o banco para eliminar a restrição NOT NULL em servicoId
db.serialize(() => {
  // Verificar estrutura existente da tabela agendamentos
  db.all("PRAGMA table_info(agendamentos)", [], (err, rows) => {
    if (err) return;

    // Se a tabela existe e tem servicoId com restrição NOT NULL, faz a migração automática
    const temServicoIdNotNull = rows && rows.some(col => col.name === 'servicoId' && col.notnull === 1);

    if (temServicoIdNotNull) {
      console.log('Migrando tabela agendamentos para remover restrição NOT NULL...');
      db.run("ALTER TABLE agendamentos RENAME TO agendamentos_old", (err) => {
        if (!err) {
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
        }
      });
    } else {
      // Criar a tabela agendamentos de forma padrão se não existir
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
    }
  });

  // Tabela de serviços
  db.run(`
    CREATE TABLE IF NOT EXISTS servicos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      preco TEXT NOT NULL
    )
  `);

  // Tabela de profissionais (Barbeiros)
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

// Listar agendamentos
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
    servico, servicoNome, servicoId,
    barbeiro, barbeiroNome,
    data, horario, hora,
    preco
  } = req.body;

  const valorNome = cliente || clienteNome || nome || 'Cliente';
  const valorWhatsapp = whatsapp || clienteWhatsapp || '';
  const valorServico = servico || servicoNome || 'Serviço';
  const valorServicoId = servicoId || 1;
  const valorBarbeiro = barbeiro || barbeiroNome || 'Barbeiro';
  const valorHorario = horario || hora || '--:--';
  const valorPreco = preco || 0;

  const query = `
    INSERT INTO agendamentos 
    (cliente, clienteNome, nome, whatsapp, clienteWhatsapp, servico, servicoId, barbeiro, data, horario, status, preco)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Agendado', ?)
  `;

  db.run(
    query,
    [
      valorNome, valorNome, valorNome,
      valorWhatsapp, valorWhatsapp,
      valorServico, valorServicoId,
      valorBarbeiro,
      data, valorHorario, valorPreco
    ],
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

// ==========================================
// ROTAS DA API DE SERVIÇOS
// ==========================================

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

// ==========================================
// ROTAS DA API DE PROFISSIONAIS
// ==========================================

app.get('/api/profissionais', (req, res) => {
  db.all('SELECT * FROM profissionais ORDER BY id DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.post('/api/profissionais', (req, res) => {
  const { nome } = req.body;

  if (!nome) {
    return res.status(400).json({ error: 'Nome do profissional é obrigatório.' });
  }

  const nomeFormatado = nome.trim();

  db.run('INSERT INTO profissionais (nome) VALUES (?)', [nomeFormatado], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ id: this.lastID, nome: nomeFormatado });
  });
});

app.put('/api/profissionais/:id', (req, res) => {
  const { id } = req.params;
  const { nome } = req.body;

  if (!nome) {
    return res.status(400).json({ error: 'Nome é obrigatório.' });
  }

  db.run('UPDATE profissionais SET nome = ? WHERE id = ?', [nome.trim(), id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id, nome: nome.trim(), updated: this.changes });
  });
});

app.delete('/api/profissionais/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM profissionais WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Profissional removido com sucesso', deleted: this.changes });
  });
});

// ==========================================
// ROTAS DE NAVEGAÇÃO DAS PÁGINAS
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

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Inicialização do Servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});