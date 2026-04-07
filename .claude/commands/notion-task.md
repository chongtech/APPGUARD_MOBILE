Workflow para iniciar trabalho numa tarefa do Notion: $ARGUMENTS

## Passos

1. **Buscar tarefa no Notion** (MCP tool)
   - Usar `mcp__notion__API-post-search` para procurar por Name: $ARGUMENTS
   - Extrair: Name, Task, Notes, ID
   - **Se tarefa não encontrada**: Ir para secção "Criar Nova Tarefa"

2. **Criar branch git** (executar skill /create-new-branch)
   - Formato do nome: `{feature}/{Name}`
   - Exemplos:
     - Feature "Add notifications" → `feature/add-notifications`
     - Bug "Fix camera iOS" → `fix/camera-ios`
     - Refactor "Optimize DataService" → `refactor/optimize-dataservice`
   - Se Type não existir, usar `task/` como prefixo

3. **Atualizar Notion** (MCP tool `mcp__notion__API-patch-page`)
   - Alterar Status → "In Progress"
   - Preencher Branch Name → nome da branch criada

4. **Mostrar resumo final**
   - Tarefa: [Name]
   - Branch: [nome da branch]
   - Descrição: [descrição da tarefa]
   - Status: Pronto para implementar!

---

## Criar Nova Tarefa

Se a tarefa não existir no Notion, criar uma nova usando `mcp__notion__API-post-page`.

### Campos a pedir ao utilizador (se não fornecidos):

| Campo | Descrição | Valores Possíveis | Default |
|-------|-----------|-------------------|---------|
| **Name** | Nome da tarefa | Texto livre | (obrigatório) |
| **Task** | Descrição detalhada | Texto livre | (obrigatório) |
| **Priority** | Prioridade | `LOW`, `MEDIUM`, `HIGH`, `TOHIGH` | `MEDIUM` |
| **Status** | Estado inicial | `Not Started`, `To Do`, `In Progress`, `Done` | `To Do` |
| **Area** | Área do projeto | Texto livre | `COMPANY` |
| **Project** | Projeto associado | Texto livre | `ELITE CONDOTRACK` |
| **Created** | Data de criação | Data ISO | Data atual |

### Fluxo de criação:

1. Verificar campos fornecidos em $ARGUMENTS
2. Para campos em falta, usar `AskUserQuestion` para perguntar:
   - "Qual o nome da tarefa?"
   - "Descreva a tarefa:"
   - "Qual a prioridade?" (opções: LOW, MEDIUM, HIGH, TOHIGH)
   - "Qual o status inicial?" (opções: Not Started, To Do, In Progress, Done)
3. Criar tarefa no Notion com os valores recolhidos + defaults
4. Continuar com o passo 2 (criar branch)

---

## Tratamento de Erros

- Se tarefa não encontrada: Perguntar se quer criar nova ou listar tarefas similares
- Se branch já existe: Perguntar se deve fazer checkout da existente ou criar nova
- Se falhar atualização do Notion: Continuar mas avisar o utilizador
- Se falhar criação da tarefa: Mostrar erro e abortar
