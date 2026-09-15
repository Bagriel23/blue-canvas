export const uiLocales = ["en-US", "pt-BR", "ko-KR"] as const;
export type UiLocale = (typeof uiLocales)[number];

export const DEFAULT_LOCALE: UiLocale = "en-US";

export interface UiMessages {
  app: {
    title: string;
    signOut: string;
    themeSystem: string;
    themeLight: string;
    themeDark: string;
    localeLabel: string;
    openNavigation: string;
    closeNavigation: string;
  };
  auth: {
    signInHeading: string;
    invitationHeading: string;
    email: string;
    password: string;
    displayName: string;
    submit: string;
    invitationToken: string;
    genericError: string;
  };
  home: {
    heading: string;
    empty: string;
    createButton: string;
    createHeading: string;
    projectName: string;
    open: string;
    kicker: string;
    lede: string;
    studioStatus: string;
    createDescription: string;
    saveTemplate: string;
    templateSaved: string;
  };
  library: {
    heading: string;
    empty: string;
    kits: string;
    templates: string;
    kicker: string;
    lede: string;
    myTemplates: string;
    useTemplate: string;
    projectName: string;
    createProject: string;
    cancel: string;
    templateUsed: string;
  };
  teams: {
    heading: string;
    kicker: string;
    lede: string;
    collaborationStatus: string;
    createHeading: string;
    createDescription: string;
    name: string;
    createButton: string;
    empty: string;
    open: string;
    members: string;
    inviteLabel: string;
    addMember: string;
    roleLabel: string;
    roleOwner: string;
    roleAdmin: string;
    roleMember: string;
    remove: string;
    emailPlaceholder: string;
  };
  workspace: {
    pages: string;
    layers: string;
    assets: string;
    inspector: string;
    preview: string;
    share: string;
    export: string;
    exitPreview: string;
    previewBack: string;
    previewReset: string;
    noSelection: string;
    style: string;
    layout: string;
    text: string;
    unsavedWarning: string;
    canvas: string;
    canvasControls: string;
    pageNotFound: string;
    zoomOut: string;
    zoomIn: string;
    fitCanvas: string;
    loading: string;
    loadError: string;
    retry: string;
    discard: string;
    saving: string;
    saved: string;
    conflict: string;
  };
  share: {
    heading: string;
    members: string;
    tokens: string;
    close: string;
    inviteEmail: string;
    inviteRole: string;
    invite: string;
    invitationCreated: string;
    remove: string;
    roleOwner: string;
    roleEditor: string;
    roleCommenter: string;
    roleViewer: string;
    emailPlaceholder: string;
    copyLink: string;
  };
  exportDialog: {
    heading: string;
    scopeProject: string;
    scopePage: string;
    scopeSelection: string;
    targetStatic: string;
    targetReact: string;
    targetPreact: string;
    targetDescription: string;
    scopeLabel: string;
    targetLabel: string;
    preview: string;
    fileCount: string;
    warnings: string;
    generating: string;
    generated: string;
    generatedDescription: string;
    noSelection: string;
    download: string;
    start: string;
    close: string;
  };
  common: {
    cancel: string;
    save: string;
    loading: string;
    errorPrefix: string;
  };
}

const enUs: UiMessages = {
  app: {
    title: "Blue Canvas",
    signOut: "Sign out",
    themeSystem: "System theme",
    themeLight: "Light theme",
    themeDark: "Dark theme",
    localeLabel: "Language",
    openNavigation: "Open navigation",
    closeNavigation: "Close navigation",
  },
  auth: {
    signInHeading: "Sign in",
    invitationHeading: "Accept invitation",
    email: "Email",
    password: "Password",
    displayName: "Display name",
    submit: "Continue",
    invitationToken: "Invitation token",
    genericError: "Could not complete the request.",
  },
  home: {
    heading: "Projects",
    empty: "You do not have any projects yet.",
    createButton: "New project",
    createHeading: "Create a project",
    projectName: "Project name",
    open: "Open",
    kicker: "Workspace / 01",
    lede: "Build interfaces with a clear visual system.",
    studioStatus: "Local studio",
    createDescription: "Start from a focused canvas and keep your flow close.",
    saveTemplate: "Save as template",
    templateSaved: "Template saved",
  },
  library: {
    heading: "Library",
    empty: "No published kits or templates yet.",
    kits: "Kits",
    templates: "Templates",
    kicker: "Resources / 02",
    lede: "Reusable building blocks for your next canvas.",
    myTemplates: "My templates",
    useTemplate: "Use template",
    projectName: "New project name",
    createProject: "Create project",
    cancel: "Cancel",
    templateUsed: "Project created",
  },
  teams: {
    heading: "Teams",
    kicker: "Collaboration / 03",
    lede: "Bring people and projects together.",
    collaborationStatus: "Shared workspace",
    createHeading: "Create a team",
    createDescription: "A shared home for your studio.",
    name: "Team name",
    createButton: "Create team",
    empty: "No teams yet.",
    open: "Manage team",
    members: "Members",
    inviteLabel: "Add a teammate",
    addMember: "Add member",
    roleLabel: "team role",
    roleOwner: "Owner",
    roleAdmin: "Admin",
    roleMember: "Member",
    remove: "Remove",
    emailPlaceholder: "designer@company.com",
  },
  workspace: {
    pages: "Pages",
    layers: "Layers",
    assets: "Assets",
    inspector: "Inspector",
    preview: "Preview",
    share: "Share",
    export: "Export",
    exitPreview: "Exit preview",
    previewBack: "Back",
    previewReset: "Reset preview",
    noSelection: "Select a node to see its properties.",
    style: "Style",
    layout: "Layout",
    text: "Text",
    unsavedWarning:
      "You have pending changes that have not been synchronized yet.",
    canvas: "Canvas",
    canvasControls: "Canvas controls",
    pageNotFound: "Page not found.",
    zoomOut: "Zoom out",
    zoomIn: "Zoom in",
    fitCanvas: "Fit canvas",
    loading: "Loading workspace…",
    loadError: "Could not load this workspace.",
    retry: "Retry",
    discard: "Discard",
    saving: "Saving…",
    saved: "Saved",
    conflict:
      "Your changes were kept locally while the document was updated elsewhere.",
  },
  share: {
    heading: "Share project",
    members: "Members",
    tokens: "Access tokens",
    close: "Close",
    inviteEmail: "Invite by email",
    inviteRole: "Role",
    invite: "Create invitation",
    invitationCreated: "Invitation link created",
    remove: "Remove",
    roleOwner: "Owner",
    roleEditor: "Editor",
    roleCommenter: "Commenter",
    roleViewer: "Viewer",
    emailPlaceholder: "designer@company.com",
    copyLink: "Copy invitation link",
  },
  exportDialog: {
    heading: "Export",
    scopeProject: "Entire project",
    scopePage: "Current page",
    scopeSelection: "Current selection",
    targetStatic: "HTML / CSS / JavaScript",
    targetReact: "React (Vite)",
    targetPreact: "Preact (Vite)",
    targetDescription: "Choose a portable output format.",
    scopeLabel: "Scope",
    targetLabel: "Format",
    preview: "Export summary",
    fileCount: "{count} files",
    warnings: "{count} warnings",
    generating: "Generating export…",
    generated: "Export ready",
    generatedDescription: "Your files are ready to download.",
    noSelection: "Select a node before exporting it.",
    download: "Download ZIP",
    start: "Start export",
    close: "Close",
  },
  common: {
    cancel: "Cancel",
    save: "Save",
    loading: "Loading…",
    errorPrefix: "Error",
  },
};

const ptBr: UiMessages = {
  app: {
    title: "Blue Canvas",
    signOut: "Sair",
    themeSystem: "Tema do sistema",
    themeLight: "Tema claro",
    themeDark: "Tema escuro",
    localeLabel: "Idioma",
    openNavigation: "Abrir navegação",
    closeNavigation: "Fechar navegação",
  },
  auth: {
    signInHeading: "Entrar",
    invitationHeading: "Aceitar convite",
    email: "E-mail",
    password: "Senha",
    displayName: "Nome de exibição",
    submit: "Continuar",
    invitationToken: "Token do convite",
    genericError: "Não foi possível concluir a solicitação.",
  },
  home: {
    heading: "Projetos",
    empty: "Você ainda não possui projetos.",
    createButton: "Novo projeto",
    createHeading: "Criar projeto",
    projectName: "Nome do projeto",
    open: "Abrir",
    kicker: "Workspace / 01",
    lede: "Construa interfaces com um sistema visual claro.",
    studioStatus: "Estúdio local",
    createDescription:
      "Comece em um canvas focado e mantenha seu fluxo por perto.",
    saveTemplate: "Salvar como template",
    templateSaved: "Template salvo",
  },
  library: {
    heading: "Biblioteca",
    empty: "Nenhum kit ou template publicado ainda.",
    kits: "Kits",
    templates: "Templates",
    kicker: "Recursos / 02",
    lede: "Blocos reutilizáveis para seu próximo canvas.",
    myTemplates: "Meus templates",
    useTemplate: "Usar template",
    projectName: "Nome do novo projeto",
    createProject: "Criar projeto",
    cancel: "Cancelar",
    templateUsed: "Projeto criado",
  },
  teams: {
    heading: "Times",
    kicker: "Colaboração / 03",
    lede: "Reúna pessoas e projetos em um só lugar.",
    collaborationStatus: "Workspace compartilhado",
    createHeading: "Criar um time",
    createDescription: "Um espaço compartilhado para seu estúdio.",
    name: "Nome do time",
    createButton: "Criar time",
    empty: "Nenhum time ainda.",
    open: "Gerenciar time",
    members: "Membros",
    inviteLabel: "Adicionar colega",
    addMember: "Adicionar membro",
    roleLabel: "papel do time",
    roleOwner: "Proprietário",
    roleAdmin: "Administrador",
    roleMember: "Membro",
    remove: "Remover",
    emailPlaceholder: "designer@empresa.com",
  },
  workspace: {
    pages: "Páginas",
    layers: "Camadas",
    assets: "Assets",
    inspector: "Inspetor",
    preview: "Prévia",
    share: "Compartilhar",
    export: "Exportar",
    exitPreview: "Sair da prévia",
    previewBack: "Voltar",
    previewReset: "Reiniciar prévia",
    noSelection: "Selecione um nó para ver suas propriedades.",
    style: "Estilo",
    layout: "Layout",
    text: "Texto",
    unsavedWarning:
      "Existem alterações pendentes que ainda não foram sincronizadas.",
    canvas: "Canvas",
    canvasControls: "Controles do canvas",
    pageNotFound: "Página não encontrada.",
    zoomOut: "Diminuir zoom",
    zoomIn: "Aumentar zoom",
    fitCanvas: "Ajustar canvas",
    loading: "Carregando workspace…",
    loadError: "Não foi possível carregar este workspace.",
    retry: "Tentar novamente",
    discard: "Descartar",
    saving: "Salvando…",
    saved: "Salvo",
    conflict:
      "Suas alterações foram mantidas localmente enquanto o documento era atualizado em outro lugar.",
  },
  share: {
    heading: "Compartilhar projeto",
    members: "Membros",
    tokens: "Tokens de acesso",
    close: "Fechar",
    inviteEmail: "Convidar por e-mail",
    inviteRole: "Papel",
    invite: "Criar convite",
    invitationCreated: "Link de convite criado",
    remove: "Remover",
    roleOwner: "Proprietário",
    roleEditor: "Editor",
    roleCommenter: "Comentarista",
    roleViewer: "Visualizador",
    emailPlaceholder: "designer@empresa.com",
    copyLink: "Copiar link de convite",
  },
  exportDialog: {
    heading: "Exportar",
    scopeProject: "Projeto inteiro",
    scopePage: "Página atual",
    scopeSelection: "Seleção atual",
    targetStatic: "HTML / CSS / JavaScript",
    targetReact: "React (Vite)",
    targetPreact: "Preact (Vite)",
    targetDescription: "Escolha um formato portátil de saída.",
    scopeLabel: "Escopo",
    targetLabel: "Formato",
    preview: "Resumo da exportação",
    fileCount: "{count} arquivos",
    warnings: "{count} avisos",
    generating: "Gerando exportação…",
    generated: "Exportação pronta",
    generatedDescription: "Seus arquivos estão prontos para baixar.",
    noSelection: "Selecione um nó antes de exportá-lo.",
    download: "Baixar ZIP",
    start: "Iniciar exportação",
    close: "Fechar",
  },
  common: {
    cancel: "Cancelar",
    save: "Salvar",
    loading: "Carregando…",
    errorPrefix: "Erro",
  },
};

const koKr: UiMessages = {
  app: {
    title: "Blue Canvas",
    signOut: "로그아웃",
    themeSystem: "시스템 테마",
    themeLight: "라이트 테마",
    themeDark: "다크 테마",
    localeLabel: "언어",
    openNavigation: "탐색 열기",
    closeNavigation: "탐색 닫기",
  },
  auth: {
    signInHeading: "로그인",
    invitationHeading: "초대 수락",
    email: "이메일",
    password: "비밀번호",
    displayName: "표시 이름",
    submit: "계속",
    invitationToken: "초대 토큰",
    genericError: "요청을 완료할 수 없습니다.",
  },
  home: {
    heading: "프로젝트",
    empty: "아직 프로젝트가 없습니다.",
    createButton: "새 프로젝트",
    createHeading: "프로젝트 만들기",
    projectName: "프로젝트 이름",
    open: "열기",
    kicker: "워크스페이스 / 01",
    lede: "명확한 시각 시스템으로 인터페이스를 만드세요.",
    studioStatus: "로컬 스튜디오",
    createDescription: "집중된 캔버스에서 시작하고 흐름을 가까이 유지하세요.",
    saveTemplate: "템플릿으로 저장",
    templateSaved: "템플릿이 저장되었습니다",
  },
  library: {
    heading: "라이브러리",
    empty: "게시된 키트나 템플릿이 없습니다.",
    kits: "키트",
    templates: "템플릿",
    kicker: "리소스 / 02",
    lede: "다음 캔버스를 위한 재사용 가능한 블록입니다.",
    myTemplates: "내 템플릿",
    useTemplate: "템플릿 사용",
    projectName: "새 프로젝트 이름",
    createProject: "프로젝트 만들기",
    cancel: "취소",
    templateUsed: "프로젝트가 생성되었습니다",
  },
  teams: {
    heading: "팀",
    kicker: "협업 / 03",
    lede: "사람과 프로젝트를 한곳에서 연결하세요.",
    collaborationStatus: "공유 워크스페이스",
    createHeading: "팀 만들기",
    createDescription: "스튜디오를 위한 공유 공간입니다.",
    name: "팀 이름",
    createButton: "팀 만들기",
    empty: "아직 팀이 없습니다.",
    open: "팀 관리",
    members: "구성원",
    inviteLabel: "동료 추가",
    addMember: "구성원 추가",
    roleLabel: "팀 역할",
    roleOwner: "소유자",
    roleAdmin: "관리자",
    roleMember: "구성원",
    remove: "삭제",
    emailPlaceholder: "designer@company.com",
  },
  workspace: {
    pages: "페이지",
    layers: "레이어",
    assets: "에셋",
    inspector: "인스펙터",
    preview: "미리보기",
    share: "공유",
    export: "내보내기",
    exitPreview: "미리보기 종료",
    previewBack: "뒤로",
    previewReset: "미리보기 초기화",
    noSelection: "속성을 보려면 노드를 선택하세요.",
    style: "스타일",
    layout: "레이아웃",
    text: "텍스트",
    unsavedWarning: "동기화되지 않은 변경 사항이 있습니다.",
    canvas: "캔버스",
    canvasControls: "캔버스 컨트롤",
    pageNotFound: "페이지를 찾을 수 없습니다.",
    zoomOut: "축소",
    zoomIn: "확대",
    fitCanvas: "캔버스 맞춤",
    loading: "워크스페이스 로드 중…",
    loadError: "이 워크스페이스를 불러올 수 없습니다.",
    retry: "다시 시도",
    discard: "삭제",
    saving: "저장 중…",
    saved: "저장됨",
    conflict:
      "문서가 다른 곳에서 업데이트되는 동안 변경 사항을 로컬에 유지했습니다.",
  },
  share: {
    heading: "프로젝트 공유",
    members: "구성원",
    tokens: "액세스 토큰",
    close: "닫기",
    inviteEmail: "이메일로 초대",
    inviteRole: "역할",
    invite: "초대 만들기",
    invitationCreated: "초대 링크가 생성되었습니다",
    remove: "삭제",
    roleOwner: "소유자",
    roleEditor: "편집자",
    roleCommenter: "댓글 작성자",
    roleViewer: "뷰어",
    emailPlaceholder: "designer@company.com",
    copyLink: "초대 링크 복사",
  },
  exportDialog: {
    heading: "내보내기",
    scopeProject: "전체 프로젝트",
    scopePage: "현재 페이지",
    scopeSelection: "현재 선택",
    targetStatic: "HTML / CSS / JavaScript",
    targetReact: "React (Vite)",
    targetPreact: "Preact (Vite)",
    targetDescription: "휴대 가능한 출력 형식을 선택하세요.",
    scopeLabel: "범위",
    targetLabel: "형식",
    preview: "내보내기 요약",
    fileCount: "{count}개 파일",
    warnings: "{count}개 경고",
    generating: "내보내는 중…",
    generated: "내보내기 준비 완료",
    generatedDescription: "파일을 다운로드할 준비가 되었습니다.",
    noSelection: "내보내기 전에 노드를 선택하세요.",
    download: "ZIP 다운로드",
    start: "내보내기 시작",
    close: "닫기",
  },
  common: {
    cancel: "취소",
    save: "저장",
    loading: "로딩 중…",
    errorPrefix: "오류",
  },
};

export const messagesByLocale: Record<UiLocale, UiMessages> = {
  "en-US": enUs,
  "pt-BR": ptBr,
  "ko-KR": koKr,
};

export const localeDisplayNames: Record<UiLocale, string> = {
  "en-US": "English",
  "pt-BR": "Português (Brasil)",
  "ko-KR": "한국어",
};
