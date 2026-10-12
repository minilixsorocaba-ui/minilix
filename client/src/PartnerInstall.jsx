import {useEffect,useState} from 'react';
export default function PartnerInstall(){
 const[prompt,setPrompt]=useState(null),[installed,setInstalled]=useState(false),[help,setHelp]=useState(false);
 useEffect(()=>{setInstalled(window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true);const ready=e=>{e.preventDefault();setPrompt(e)};const done=()=>{setInstalled(true);setPrompt(null)};window.addEventListener('beforeinstallprompt',ready);window.addEventListener('appinstalled',done);return()=>{window.removeEventListener('beforeinstallprompt',ready);window.removeEventListener('appinstalled',done)}},[]);
 if(installed)return null;
 return <section className="pp-install" aria-label="Instalar Portal do Condomínio"><img src="/portal-condominio-192.png" alt="" width="44" height="44"/><div><b>Portal do Condomínio</b><button onClick={async()=>{if(prompt){await prompt.prompt();const result=await prompt.userChoice;if(result.outcome==='accepted')setInstalled(true);setPrompt(null)}else setHelp(!help)}}>Adicionar à tela inicial</button>{help&&<p>No Android: abra no Chrome, toque no menu ⋮ e escolha “Instalar aplicativo” ou “Adicionar à tela inicial”. No iPhone: abra no Safari, toque em Compartilhar e em “Adicionar à Tela de Início”.</p>}</div></section>
}
