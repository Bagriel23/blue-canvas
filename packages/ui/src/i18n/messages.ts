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
  };
  library: {
    heading: string;
    empty: string;
    kits: string;
    templates: string;
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
    noSelection: string;
    style: string;
    layout: string;
    text: string;
    unsavedWarning: string;
  };
  share: {
    heading: string;
    members: string;
    tokens: string;
    close: string;
  };
  exportDialog: {
    heading: string;
    scopeProject: string;
    scopePage: string;
    scopeSelection: string;
    targetStatic: string;
    targetReact: string;
    targetPreact: string;
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
  },
  library: {
    heading: "Library",
    empty: "No published kits or templates yet.",
    kits: "Kits",
    templates: "Templates",
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
    noSelection: "Select a node to see its properties.",
    style: "Style",
    layout: "Layout",
    text: "Text",
    unsavedWarning:
      "You have pending changes that have not been synchronized yet.",
  },
  share: {
    heading: "Share project",
    members: "Members",
    tokens: "Access tokens",
    close: "Close",
  },
  exportDialog: {
    heading: "Export",
    scopeProject: "Entire project",
    scopePage: "Current page",
    scopeSelection: "Current selection",
    targetStatic: "HTML / CSS / JavaScript",
    targetReact: "React (Vite)",
    targetPreact: "Preact (Vite)",
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
  },
  library: {
    heading: "Biblioteca",
    empty: "Nenhum kit ou template publicado ainda.",
    kits: "Kits",
    templates: "Templates",
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
    noSelection: "Selecione um nó para ver suas propriedades.",
    style: "Estilo",
    layout: "Layout",
    text: "Texto",
    unsavedWarning:
      "Existem alterações pendentes que ainda não foram sincronizadas.",
  },
  share: {
    heading: "Compartilhar projeto",
    members: "Membros",
    tokens: "Tokens de acesso",
    close: "Fechar",
  },
  exportDialog: {
    heading: "Exportar",
    scopeProject: "Projeto inteiro",
    scopePage: "Página atual",
    scopeSelection: "Seleção atual",
    targetStatic: "HTML / CSS / JavaScript",
    targetReact: "React (Vite)",
    targetPreact: "Preact (Vite)",
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
  },
  library: {
    heading: "라이브러리",
    empty: "게시된 키트나 템플릿이 없습니다.",
    kits: "키트",
    templates: "템플릿",
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
    noSelection: "속성을 보려면 노드를 선택하세요.",
    style: "스타일",
    layout: "레이아웃",
    text: "텍스트",
    unsavedWarning: "동기화되지 않은 변경 사항이 있습니다.",
  },
  share: {
    heading: "프로젝트 공유",
    members: "구성원",
    tokens: "액세스 토큰",
    close: "닫기",
  },
  exportDialog: {
    heading: "내보내기",
    scopeProject: "전체 프로젝트",
    scopePage: "현재 페이지",
    scopeSelection: "현재 선택",
    targetStatic: "HTML / CSS / JavaScript",
    targetReact: "React (Vite)",
    targetPreact: "Preact (Vite)",
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
