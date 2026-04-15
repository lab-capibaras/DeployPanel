const es = {
  // ── Navbar ──────────────────────────────────────────────
  nav: {
    tools:     'Herramientas',
    menu:      'Menú',
    login:     'Login',
    appearance:'Aspecto',
    language:  'Idioma',
    light:     'Claro',
    dark:      'Oscuro',
  },

  // ── Home ────────────────────────────────────────────────
  home: {
    badge:      'Plataforma de Despliegue Avanzada',
    h1_1:       'Escala sin',
    h1_2:       'límites',
    subtitle:   'Arquitectura en la nube completamente automatizada. Integra tu repositorio, orquesta tus entornos y despliega infraestructura global con zero-downtime.',
    cta_start:  'Comenzar Despliegue',
    cta_explore:'Explorar Arquitectura',

    metrics: [
      { val: '99.99%', label: 'SLA Garantizado'  },
      { val: '< 10ms', label: 'Latencia Global'  },
      { val: '3M+',    label: 'Deployments'       },
      { val: 'Zero',   label: 'Config Manual'     },
    ],

    features_title: 'Infraestructura como Experiencia',
    features_sub:   'No lidies con servidores. Hemos abstraído la complejidad operativa para que te enfoques solo en enviar código.',

    cards: [
      {
        title: 'Pipeline de Despliegue Inmutable',
        desc:  'Cada commit genera un build inmutable. Despliega versiones seguras, revierte instantáneamente y garantiza paridad matemática entre entornos.',
      },
      {
        title: 'Red Distribuida Segura',
        desc:  'Protección DDoS nativa. Certificados TLS aprovisionados y renovados en segundo plano automáticamente y sin costo adicional.',
      },
      {
        title: 'Enrutamiento DNS Global',
        desc:  'Borde distribuido que acerca el cómputo a tus clientes finales, reduciendo saltos de red y latencia drásticamente.',
      },
      {
        title: 'Observabilidad Transparente',
        desc:  'Telemetría lista para usarse. Visualiza cuellos de botella en memoria, carga de CPU y banda ancha de red en tiempo real.',
      },
    ],

    timeline_title: 'Arquitectura de Cero a Cien',
    timeline_sub:   'El ciclo de vida de tu aplicación, simplificado.',
    timeline_steps: [
      { title: 'Integración de Código',      desc: 'Escuchamos cada evento de tu repositorio vinculado de forma determinista y segura.' },
      { title: 'Orquestación del Entorno',   desc: 'Detectamos la base de código y la encapsulamos en un contenedor de sistema inmutable y sellado.' },
      { title: 'Publicación Global',          desc: 'La red de distribución expone tu servicio de forma balanceada y de alta disponibilidad alrededor del mundo.' },
    ],

    cta_title:   'El Futuro de la Infraestructura',
    cta_sub:     'Deja de operar servidores y manejar escalamiento complejo. Comienza a implementar experiencias sólidas desde hoy.',
    cta_btn:     'Inicia un Despliegue Configurado',

    footer: {
      columns: [
        { title: 'Plataforma',   links: ['Arquitectura Central', 'Red de Distribución', 'Orquestación Avanzada'] },
        { title: 'Desarrollo',   links: ['Documentación Técnica', 'Guías y Patrones', 'Registros de API'] },
        { title: 'Organización', links: ['Equipo Institucional', 'Carreras Profesionales', 'Sala de Noticias'] },
        { title: 'Normativa',    links: ['Avisos y Contratos', 'Privacidad Corporativa', 'Auditorías de Seguridad'] },
      ],
      copy:   '© 2026 StarDest Cloud Operations.',
      status: 'Estado del Sistema',
      sla:    'Acuerdos de Nivel de Servicio',
    },
  },

  // ── Deploy ──────────────────────────────────────────────
  deploy: {
    badge:    'Panel de Despliegue',
    title_1:  'Nuevo',
    title_2:  'Despliegue',
    subtitle: 'Conecta tu repositorio y publica en segundos',

    form: {
      repo_label:       'URL del Repositorio GitHub',
      repo_placeholder: 'https://github.com/usuario/repositorio',
      repo_hint:        'Repositorio:',
      load_branches:    'Cargar Ramas',
      loading:          'Cargando',
      branch_label:     'Rama a Desplegar',
      subdomain_label:  'Subdominio',
      subdomain_ph:     'mi-app',
      subdomain_suffix: '.stardest.com',
      subdomain_url:    'URL final:',
      submit:           'Revisar Despliegue',
    },

    validation: {
      required:    'El subdominio es obligatorio',
      invalid:     'Solo letras minúsculas, números y guiones. No puede empezar ni terminar con guión.',
      too_long:    'Máximo 40 caracteres',
      fill_all:    'Completa todos los campos',
      invalid_url: 'URL de GitHub inválida. Usa: github.com/usuario/repo',
      no_repo:     'Ingresa la URL del repositorio primero',
    },

    confirm: {
      title:   'Revisa el Despliegue',
      sub:     'Confirma los parámetros antes de iniciar',
      repo:    'Repositorio',
      branch:  'Rama',
      url:     'URL de producción',
      edit:    'Editar',
      confirm: 'Confirmar y Desplegar',
    },

    progress: {
      title:   'Desplegando...',
      clone:   'Clonado',
      build:   'Compilado',
      publish: 'Publicado',
    },

    success: {
      title:      'Despliegue Exitoso',
      sub:        'Tu aplicación está activa y recibiendo tráfico',
      repo:       'Repositorio',
      branch:     'Rama desplegada',
      status:     'Estado',
      status_val: 'ACTIVO',
      open:       'Abrir en Nueva Pestaña',
      new_deploy: 'Desplegar Otro Proyecto',
    },

    error: {
      title:  'Error en el Despliegue',
      retry:  'Reintentar Despliegue',
      modify: 'Modificar Configuración',
    },

    toasts: {
      branches_loaded: (n) => `${n} ramas cargadas`,
      server_error:    'El servidor retornó un error al desplegar',
    },

    logs: [
      { delay: 300,   text: '> Iniciando pipeline de despliegue...',       color: 'text-[#CBCDD3]' },
      { delay: 700,   text: '> Conectando con repositorio remoto...',       color: 'text-[#CBCDD3]' },
      { delay: 1300,  text: '✓ Repositorio autenticado correctamente',      color: 'text-green-400' },
      { delay: 1800,  text: '> Clonando rama seleccionada...',              color: 'text-[#CBCDD3]' },
      { delay: 2500,  text: '✓ Clonado completo — 142 archivos indexados',  color: 'text-green-400' },
      { delay: 3000,  text: '> Detectando entorno de ejecución...',         color: 'text-[#CBCDD3]' },
      { delay: 3600,  text: '✓ Entorno detectado y configurado',            color: 'text-green-400' },
      { delay: 4000,  text: '> Construyendo imagen de contenedor...',       color: 'text-[#CBCDD3]' },
      { delay: 5000,  text: '> Resolviendo dependencias del proyecto...',   color: 'text-[#CBCDD3]' },
      { delay: 6000,  text: '✓ Imagen compilada [1.21s]',                   color: 'text-green-400' },
      { delay: 6500,  text: '> Provisionando red de distribución...',       color: 'text-[#CBCDD3]' },
      { delay: 7200,  text: '> Registrando dominio en proxy inverso...',    color: 'text-[#CBCDD3]' },
      { delay: 8000,  text: '✓ Certificado TLS provisionado automáticamente', color: 'text-green-400' },
      { delay: 8500,  text: '> Publicando contenedor en nodo activo...',    color: 'text-[#CBCDD3]' },
      { delay: 9200,  text: '✓ Contenedor activo y respondiendo',           color: 'text-green-400' },
      { delay: 9800,  text: '> Ejecutando health check...',                 color: 'text-[#CBCDD3]' },
      { delay: 10500, text: '✓ HEALTH CHECK PASSED [200 OK]',               color: 'text-green-400 font-bold' },
    ],
  },

  // ── Login ───────────────────────────────────────────────
  login: {
    welcome:        'Bienvenido',
    subtitle:       'Inicia sesión en tu cuenta',
    email_label:    'Correo Electrónico',
    email_ph:       'tu@email.com',
    password_label: 'Contraseña',
    password_ph:    '••••••••',
    forgot:         '¿Olvidaste tu contraseña?',
    remember:       'Recordarme',
    submit:         'Iniciar Sesión',
    submitting:     'Iniciando sesión...',
    or_continue:    'O continúa con',
    no_account:     '¿No tienes una cuenta?',
    sign_up:        'Regístrate',
    back_home:      'Volver al inicio',
  },
};

export default es;
