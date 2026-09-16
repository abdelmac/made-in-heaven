import type { Metadata, Viewport } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Solace — Faites place à la concentration',
  description: 'Un espace serein pour vous concentrer, organiser vos tâches et progresser chaque jour.',
  applicationName: 'Solace',
  icons: {
    icon: [{ url: '/icons/solace.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/icons/solace-180.png', sizes: '180x180', type: 'image/png' }],
  },
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Solace' },
};
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#f7f8f4',
};
const themeScript = `try {
  var p=JSON.parse(localStorage.getItem('folia.appearance')||'{}');
  var r=document.documentElement;
  var m=['light','dark','system'].includes(p.mode)?p.mode:'system';
  r.dataset.theme=m==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):m;
  r.dataset.accent=['green','blue','plum','amber','neutral','blurple','rose','cyan'].includes(p.accent)?p.accent:'green';
  [['density',['comfortable','compact']],['fontSize',['small','medium','large']],['radius',['small','medium','large']],['motion',['standard','reduced']]].forEach(function(e){
    if(e[1].includes(p[e[0]]))r.dataset[e[0]==='fontSize'?'font':e[0]]=p[e[0]];
  });
  var t=p.customTheme;
  var valid=function(c){return typeof c==='string'&&/^#[0-9a-fA-F]{6}$/.test(c);};
  if(t){
    ['accent','background','surface','border','text'].forEach(function(k){if(valid(t[k]))r.style.setProperty('--'+k,t[k]);});
    if(Array.isArray(t.heatmap)&&t.heatmap.length===5)t.heatmap.forEach(function(c,i){if(valid(c))r.style.setProperty('--heat-'+i,c);});
  }
  if(p.resolvedTheme===r.dataset.theme&&p.resolvedColors){
    ['background','surface','surface-soft','sidebar','text','muted','secondary-text','border','accent','on-accent','accent-hover','accent-soft','sage','danger','danger-soft','heat-0','heat-1','heat-2','heat-3','heat-4','on-heat-0','on-heat-1','on-heat-2','on-heat-3','on-heat-4'].forEach(function(k){
      if(valid(p.resolvedColors[k]))r.style.setProperty('--'+k,p.resolvedColors[k]);
    });
  }
}catch(e){}`;
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
