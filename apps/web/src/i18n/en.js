const en = {
  // ── Navbar ──────────────────────────────────────────────
  nav: {
    tools:     'Tools',
    menu:      'Menu',
    login:     'Login',
    appearance:'Appearance',
    language:  'Language',
    light:     'Light',
    dark:      'Dark',
  },

  // ── Home ────────────────────────────────────────────────
  home: {
    badge:      'Advanced Deployment Platform',
    h1_1:       'Scale without',
    h1_2:       'limits',
    subtitle:   'Fully automated cloud architecture. Connect your repository, orchestrate your environments, and deploy global infrastructure with zero downtime.',
    cta_start:  'Start Deployment',
    cta_explore:'Explore Architecture',

    metrics: [
      { val: '99.99%', label: 'Guaranteed SLA'  },
      { val: '< 10ms', label: 'Global Latency'  },
      { val: '3M+',    label: 'Deployments'      },
      { val: 'Zero',   label: 'Manual Config'    },
    ],

    features_title: 'Infrastructure as Experience',
    features_sub:   "Don't wrestle with servers. We've abstracted operational complexity so you can focus solely on shipping code.",

    cards: [
      {
        title: 'Immutable Deployment Pipeline',
        desc:  'Every commit produces an immutable build. Deploy safely, roll back instantly, and guarantee mathematical parity across environments.',
      },
      {
        title: 'Secure Distributed Network',
        desc:  'Native DDoS protection. TLS certificates provisioned and renewed automatically in the background at no extra cost.',
      },
      {
        title: 'Global DNS Routing',
        desc:  'Distributed edge that brings compute closer to your end users, drastically reducing network hops and latency.',
      },
      {
        title: 'Transparent Observability',
        desc:  'Telemetry ready out of the box. Visualize memory bottlenecks, CPU load, and network bandwidth in real time.',
      },
    ],

    timeline_title: 'Architecture from Zero to Live',
    timeline_sub:   "Your application's lifecycle, simplified.",
    timeline_steps: [
      { title: 'Code Integration',    desc: 'We listen to every event from your linked repository in a deterministic and secure manner.' },
      { title: 'Environment Setup',   desc: 'We detect the codebase and encapsulate it in an immutable, sealed system container.' },
      { title: 'Global Publication',  desc: 'The distribution network exposes your service in a load-balanced, high-availability manner around the world.' },
    ],

    cta_title: 'The Future of Infrastructure',
    cta_sub:   'Stop operating servers and managing complex scaling. Start shipping solid experiences today.',
    cta_btn:   'Start a Configured Deployment',

    footer: {
      columns: [
        { title: 'Platform',     links: ['Core Architecture', 'Distribution Network', 'Advanced Orchestration'] },
        { title: 'Development',  links: ['Technical Docs', 'Guides & Patterns', 'API References'] },
        { title: 'Organization', links: ['Core Team', 'Careers', 'Newsroom'] },
        { title: 'Legal',        links: ['Terms & Policies', 'Privacy Policy', 'Security Audits'] },
      ],
      copy:   '© 2026 StarDest Cloud Operations.',
      status: 'System Status',
      sla:    'Service Level Agreements',
    },
  },

  // ── Deploy ──────────────────────────────────────────────
  deploy: {
    badge:    'Deployment Panel',
    title_1:  'New',
    title_2:  'Deployment',
    subtitle: 'Connect your repository and go live in seconds',

    form: {
      repo_label:       'GitHub Repository URL',
      repo_placeholder: 'https://github.com/user/repository',
      repo_hint:        'Repository:',
      load_branches:    'Load Branches',
      loading:          'Loading',
      branch_label:     'Branch to Deploy',
      subdomain_label:  'Subdomain',
      subdomain_ph:     'my-app',
      subdomain_suffix: '.stardest.com',
      subdomain_url:    'Final URL:',
      submit:           'Review Deployment',
    },

    validation: {
      required:    'Subdomain is required',
      invalid:     'Lowercase letters, numbers and hyphens only. Cannot start or end with a hyphen.',
      too_long:    'Maximum 40 characters',
      fill_all:    'Please fill in all fields',
      invalid_url: 'Invalid GitHub URL. Use: github.com/user/repo',
      no_repo:     'Enter the repository URL first',
    },

    confirm: {
      title:   'Review Deployment',
      sub:     'Confirm parameters before launching',
      repo:    'Repository',
      branch:  'Branch',
      url:     'Production URL',
      edit:    'Edit',
      confirm: 'Confirm & Deploy',
    },

    progress: {
      title:   'Deploying...',
      clone:   'Cloned',
      build:   'Built',
      publish: 'Published',
    },

    success: {
      title:      'Deployment Successful',
      sub:        'Your application is live and receiving traffic',
      repo:       'Repository',
      branch:     'Deployed branch',
      status:     'Status',
      status_val: 'ACTIVE',
      open:       'Open in New Tab',
      new_deploy: 'Deploy Another Project',
    },

    error: {
      title:  'Deployment Failed',
      retry:  'Retry Deployment',
      modify: 'Modify Configuration',
    },

    toasts: {
      branches_loaded: (n) => `${n} branches loaded`,
      server_error:    'The server returned an error while deploying',
    },

    logs: [
      { delay: 300,   text: '> Starting deployment pipeline...',           color: 'text-[#CBCDD3]' },
      { delay: 700,   text: '> Connecting to remote repository...',        color: 'text-[#CBCDD3]' },
      { delay: 1300,  text: '✓ Repository authenticated successfully',     color: 'text-green-400' },
      { delay: 1800,  text: '> Cloning selected branch...',                color: 'text-[#CBCDD3]' },
      { delay: 2500,  text: '✓ Clone complete — 142 files indexed',        color: 'text-green-400' },
      { delay: 3000,  text: '> Detecting runtime environment...',          color: 'text-[#CBCDD3]' },
      { delay: 3600,  text: '✓ Environment detected and configured',       color: 'text-green-400' },
      { delay: 4000,  text: '> Building container image...',               color: 'text-[#CBCDD3]' },
      { delay: 5000,  text: '> Resolving project dependencies...',         color: 'text-[#CBCDD3]' },
      { delay: 6000,  text: '✓ Image compiled [1.21s]',                    color: 'text-green-400' },
      { delay: 6500,  text: '> Provisioning distribution network...',      color: 'text-[#CBCDD3]' },
      { delay: 7200,  text: '> Registering domain in reverse proxy...',    color: 'text-[#CBCDD3]' },
      { delay: 8000,  text: '✓ TLS certificate provisioned automatically', color: 'text-green-400' },
      { delay: 8500,  text: '> Publishing container to active node...',    color: 'text-[#CBCDD3]' },
      { delay: 9200,  text: '✓ Container active and responding',           color: 'text-green-400' },
      { delay: 9800,  text: '> Running health check...',                   color: 'text-[#CBCDD3]' },
      { delay: 10500, text: '✓ HEALTH CHECK PASSED [200 OK]',              color: 'text-green-400 font-bold' },
    ],
  },

  // ── Login ───────────────────────────────────────────────
  login: {
    welcome:        'Welcome',
    subtitle:       'Sign in to your account',
    email_label:    'Email Address',
    email_ph:       'you@email.com',
    password_label: 'Password',
    password_ph:    '••••••••',
    forgot:         'Forgot your password?',
    remember:       'Remember me',
    submit:         'Sign In',
    submitting:     'Signing in...',
    or_continue:    'Or continue with',
    no_account:     "Don't have an account?",
    sign_up:        'Sign up',
    back_home:      'Back to home',
  },
};

export default en;
