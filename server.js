// Admin - Relatórios e Métricas Financeiras
app.get('/api/admin/relatorios', (req, res) => {
  try {
    // Data de hoje no formato YYYY-MM-DD
    const hoje = new Date().toISOString().split('T')[0];
    const mesAtual = hoje.substring(0, 7); // YYYY-MM

    // 1. Faturamento Total (Apenas atendidos)
    const stmtTotal = db.prepare("SELECT SUM(preco) as total, COUNT(*) as qtd FROM agendamentos WHERE status = 'atendido'");
    const resTotal = stmtTotal.get();

    // 2. Faturamento de Hoje
    const stmtHoje = db.prepare("SELECT SUM(preco) as total FROM agendamentos WHERE data = ? AND status = 'atendido'");
    const resHoje = stmtHoje.get(hoje);

    // 3. Faturamento do Mês Atual
    const stmtMes = db.prepare("SELECT SUM(preco) as total FROM agendamentos WHERE data LIKE ? AND status = 'atendido'");
    const resMes = stmtMes.get(`${mesAtual}%`);

    // 4. Barbeiro Destaque (mais receita gerada)
    const stmtBarbeiro = db.prepare(`
      SELECT barbeiroNome, SUM(preco) as receita, COUNT(*) as totalAtendimentos 
      FROM agendamentos 
      WHERE status = 'atendido' 
      GROUP BY barbeiroId 
      ORDER BY receita DESC 
      LIMIT 1
    `);
    const barbeiroDestaque = stmtBarbeiro.get();

    // 5. Serviço Mais Popular
    const stmtServico = db.prepare(`
      SELECT servicoNome, COUNT(*) as totalVendas 
      FROM agendamentos 
      WHERE status = 'atendido' 
      GROUP BY servicoId 
      ORDER BY totalVendas DESC 
      LIMIT 1
    `);
    const servicoPopular = stmtServico.get();

    res.json({
      sucesso: true,
      estatisticas: {
        faturamentoTotal: resTotal.total || 0,
        atendimentosRealizados: resTotal.qtd || 0,
        faturamentoHoje: resHoje.total || 0,
        faturamentoMes: resMes.total || 0,
        barbeiroDestaque: barbeiroDestaque ? barbeiroDestaque.barbeiroNome : 'Nenhum ainda',
        receitaBarbeiroDestaque: barbeiroDestaque ? barbeiroDestaque.receita : 0,
        servicoPopular: servicoPopular ? servicoPopular.servicoNome : 'Nenhum ainda'
      }
    });

  } catch (error) {
    console.error('Erro ao gerar relatório:', error);
    res.status(500).json({ sucesso: false, erro: 'Erro ao calcular relatórios.' });
  }
});