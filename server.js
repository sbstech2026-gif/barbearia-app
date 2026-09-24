const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware para processar JSON e formulários
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir ficheiros estáticos da pasta 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Conectar ao Banco de Dados SQLite
const db = new sqlite3.Database('./barbearia.db', (err) => {
  if (err) {
    console.error('Erro ao conectar ao SQLite:', err.message);
  } else {
    console.log('Conectado ao banco de dados SQLite com sucesso.');
  }
});

// Inicialização e Migração Automática e Segura do Banco de Dados
db.serialize(() => {
  // 1. Tabela de agendamentos base
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
      preco REAL
    )
  `);

  // 2. Migração automática: adiciona colunas ausentes sem quebrar tabelas existentes
  db.all(`PRAGMA table_info(agendamentos)`, [], (err, columns) => {
    if (err) {
      console.error('Erro ao verificar estrutura da tabela agendamentos:', err.message);
      return;
    }

    const colunasExistentes = columns.map(c => c.name);
    const colunasDesejadas = [
      { name: 'clienteNome', type: 'TEXT' },
      { name: 'nome', type: 'TEXT' },
      { name: 'clienteWhatsapp', type: 'TEXT' },
      { name: 'servicoId', type: 'INTEGER' }
    ];

    colunasDesejadas.forEach(col => {
      if (!colunasExistentes.includes(col.name)) {
        db.run(`ALTER TABLE agendamentos ADD COLUMN ${col.name} ${col.type}`, (err) => {
          if (err) {
            console.error(`Erro ao adicionar coluna ${col.name}:`, err.message);
          } else {
            console.log(`Coluna ${col.name} adicionada com sucesso na tabela agendamentos.`);
          }
        });
      }
    });
  });

  // 3. Tabela de serviços
  db.run(`
    CREATE TABLE IF NOT EXISTS servicos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      preco TEXT NOT NULL
    )
  `);

  // 4. Tabela de profissionais (Barbeiros)
  db.run(`
    CREATE TABLE IF NOT EXISTS profissionais (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL
    )
  `);
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

app.post('/api/agendamentos', (req, res) => {
  const {
    cliente, clienteNome, nome,
    whatsapp, clienteWhatsapp,
    servico, servicoNome,
    barbeiro, barbeiroNome,
    data, horario, hora,
    preco
  } = req.body;

  // Garante a extração do valor independentemente da nomenclatura vinda do front-end
  const valorNome = cliente || clienteNome || nome || 'Cliente';
  const valorWhatsapp = whatsapp || clienteWhatsapp || '';
  const valorServico = servico || servicoNome || 'Serviço';
  const valorBarbeiro = barbeiro || barbeiroNome || 'Barbeiro';
  const valorHorario = horario || hora || '--:--';
  const valorPreco = preco || 0;

  // Usa apenas as colunas padrão que sempre existiram na tabela base para garantir compatibilidade 100%
  const query = `
    INSERT INTO agendamentos 
    (cliente, whatsapp, servico, barbeiro, data, horario, status, preco)
    VALUES (?, ?, ?, ?, ?, ?, 'Agendado', ?)
  `;

  db.run(
    query,
    [
      valorNome,
      valorWhatsapp,
      valorServico,
      valorBarbeiro,
      data,
      valorHorario,
      valorPreco
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
// ROTA DA API DE ESTATÍSTICAS (Gráficos)
// ==========================================

app.get('/api/estatisticas', (req, res) => {
  const queries = {
    faturamento: `
      SELECT 
        SUM(CASE WHEN date(data) = date('now') THEN preco ELSE 0 END) as diario,
        SUM(CASE WHEN strftime('%W', data) = strftime('%W', 'now') THEN preco ELSE 0 END) as semanal,
        SUM(CASE WHEN strftime('%m', data) = strftime('%m', 'now') THEN preco ELSE 0 END) as mensal
      FROM agendamentos WHERE status = 'Agendado' OR status = 'Concluído'`,
    horarios: `
      SELECT horario, COUNT(*) as total 
      FROM agendamentos 
      GROUP BY horario 
      ORDER BY total DESC LIMIT 5`,
    servicos: `
      SELECT servico, COUNT(*) as total 
      FROM agendamentos 
      GROUP BY servico 
      ORDER BY total DESC`
  };

  db.get(queries.faturamento, [], (err, fat) => {
    if (err) return res.status(500).json({ error: err.message });

    db.all(queries.horarios, [], (err, hor) => {
      if (err) return res.status(500).json({ error: err.message });

      db.all(queries.servicos, [], (err, serv) => {
        if (err) return res.status(500).json({ error: err.message });

        res.json({
          faturamento: fat || { diario: 0, semanal: 0, mensal: 0 },
          horarios: hor,
          servicos: serv
        });
      });
    });
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

// Inicializar Servidor
app.listen(PORT, () => {
  console.log(`Servidor a rodar na porta ${PORT}`);
});