const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Banco de dados temporário em memória
let agendamentos = [
    {
        id: '1',
        data: '2026-09-17',
        horario: '09:00',
        clienteNome: 'Jesus',
        clienteWhatsapp: '(49) 98872-7098',
        servicoNome: 'Barba Completa',
        barbeiroNome: 'Carlos (Mestre Barbeiro)',
        preco: 35.00,
        status: 'Confirmado'
    }
];

// 1. Rota para Salvar Novo Agendamento
app.post('/api/agendamentos', (req, res) => {
    const { clienteNome, clienteWhatsapp, servicoNome, barbeiroNome, data, horario, preco } = req.body;

    const novoAgendamento = {
        id: Date.now().toString(),
        clienteNome: clienteNome || 'Cliente',
        clienteWhatsapp: clienteWhatsapp || '',
        servicoNome: servicoNome || 'Serviço',
        barbeiroNome: barbeiroNome || 'Barbeiro',
        data: data || new Date().toISOString().split('T')[0],
        horario: horario || '00:00',
        preco: parseFloat(preco) || 0,
        status: 'Confirmado'
    };

    agendamentos.push(novoAgendamento);
    console.log('Novo agendamento recebido:', novoAgendamento);

    res.status(201).json({ success: true, agendamento: novoAgendamento });
});

// 2. Rota para Buscar Agendamentos e KPIs
app.get('/api/agendamentos', (req, res) => {
    const { data } = req.query;

    let filtrados = agendamentos;
    if (data) {
        filtrados = agendamentos.filter(a => a.data === data);
    }

    // Cálculo de KPIs
    const concluidos = agendamentos.filter(a => a.status === 'Concluído');
    
    // Hoje
    const hojeStr = new Date().toISOString().split('T')[0];
    const fatHoje = concluidos
        .filter(a => a.data === hojeStr)
        .reduce((acc, a) => acc + (a.preco || 0), 0);

    // Mês
    const fatMes = concluidos.reduce((acc, a) => acc + (a.preco || 0), 0);

    const kpis = {
        faturamentoHoje: fatHoje.toFixed(2).replace('.', ','),
        faturamentoMes: fatMes.toFixed(2).replace('.', ','),
        barbeiroDestaque: 'Carlos',
        vendasBarbeiro: fatMes.toFixed(2).replace('.', ','),
        servicoPopular: 'Barba Completa'
    };

    res.json({
        agendamentos: filtrados,
        kpis: kpis
    });
});

// 3. Atualizar Status (Concluir / Cancelar)
app.patch('/api/agendamentos/:id/status', (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    const item = agendamentos.find(a => a.id === id);
    if (item) {
        item.status = status;
        return res.json({ success: true, agendamento: item });
    }
    res.status(404).json({ error: 'Agendamento não encontrado' });
});

// 4. Limpar Agenda do Dia
app.delete('/api/agendamentos/limpar', (req, res) => {
    const { data } = req.query;
    if (data) {
        agendamentos = agendamentos.filter(a => a.data !== data);
    }
    res.json({ success: true });
});

// Servir os arquivos das páginas
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/painel', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'painel.html'));
});

app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});