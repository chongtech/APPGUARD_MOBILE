# Plano de Testes - Painel Administrativo (Admin Panel)

Este documento serve como um roteiro para validar todas as funcionalidades do Painel Administrativo do Elite Condo Guard. Utilize as caixas de seleção para marcar o progresso dos testes.


## Gestão de Dispositivos (`AdminDevices`)

### Ações
- [ ] **Editar Dispositivo**:
    - [ ] Associar/Desassociar de um condomínio.
- [ ] **Desativar (Decommission)**:
    - [ ] Testar a desativação de um dispositivo.
    - [ ] Verificar se o status muda para DESATIVADO.


**Funcionalidades Backend Disponíveis:**
- `adminUpdateDevice()` - Pode alterar status do dispositivo
- `adminDecommissionDevice()` - Marca dispositivo como DECOMMISSIONED

**Solução Proposta:**  
Adicionar botões de ação na listagem de dispositivos:
1. **Botão Editar** - Para renomear e associar/desassociar condomínio
2. **Botão Toggle Status** - Para ativar/desativar (ACTIVE ↔ INACTIVE)
3. **Botão Decommission** - Para desativar permanentemente (com confirmação)

**Localização do Código:**
- Backend: `src/services/Supabase.ts` (linhas 959-995)
- Frontend: `src/pages/admin/AdminDevices.tsx` (adicionar botões de ação)


## Gestão de Incidentes (`AdminIncidents`)
### Listagem e Filtros
- [ ] **Filtros Combinados**: Testar filtro por Condomínio + Status (Pendente, Resolvido, etc.).
- [ ] **Busca**: Buscar por descrição ou nome do residente.

### Workflow de Incidentes
- [ ] **Reconhecer (Acknowledge)**:
    - [ ] Clicar em "Reconhecer" em um incidente Pendente.
    - [ ] Verificar mudança de status para RECONHECIDO.
- [ ] **Resolver (Resolve)**:
    - [ ] Resolver diretamente (sem notas).
    - [ ] Resolver com notas (modal de notas).
    - [ ] Verificar mudança de status para RESOLVIDO.
- [ ] **Adicionar Notas**:
    - [ ] Adicionar notas a um incidente sem resolvê-lo (se aplicável) ou durante a resolução.
- [ ] **Exportar CSV**:
    - [ ] Testar o botão de exportação e verificar se o arquivo é baixado corretamente.

## Offline
### testar offline

## Kafka
### testar click


