import {useEffect} from 'react';

const tel=value=>`tel:+84${String(value||'').replace(/\D/g,'').replace(/^0/,'')}`;

export default function SiteSettings({settings={}}){
  useEffect(()=>{
    let headingObserver;
    const text=(selector,value)=>{const element=document.querySelector(selector);if(element&&value)element.textContent=value;};
    document.querySelectorAll('a[href^="tel:"]').forEach((link,index)=>{
      const slot=link.dataset.sitePhone||(index%2===0?'primary':'secondary');link.dataset.sitePhone=slot;
      const value=slot==='primary'?settings.phone_primary:settings.phone_secondary;if(value){link.textContent=value;link.href=tel(value);}
    });
    document.querySelectorAll('footer a[href^="mailto:"],.contact-phone a[href^="mailto:"]').forEach((link,index)=>{if(settings.email_contact){link.textContent=settings.email_contact;link.href=`mailto:${settings.email_contact}`;}if(index>0)link.remove();});
    document.querySelectorAll('.brand-logo').forEach(image=>{if(settings.logo_url)image.src=settings.logo_url;});
    document.querySelectorAll('a[href="/quan-tri"]').forEach(link=>{link.target='_blank';link.rel='noreferrer';});
    const heading=document.querySelector('.hero-copy h1');if(heading){const title=String(settings.hero_title||'Your trusted home').trim().split(/\s+/),accent=String(settings.hero_accent||'AWAY FROM HOME.').trim().split(/\s+/),home=title.pop()||'',away=(accent.shift()||'').toLowerCase(),titleLine=title.join(' '),accentText=accent.join(' ').toLowerCase(),accentLine=accentText?accentText[0].toUpperCase()+accentText.slice(1):'';const renderHeading=()=>heading.replaceChildren(document.createTextNode(titleLine),document.createElement('br'),document.createTextNode(`${home} `),Object.assign(document.createElement('em'),{textContent:away}),document.createElement('br'),Object.assign(document.createElement('em'),{textContent:accentLine}));const isCorrect=()=>{const nodes=heading.childNodes,emphasis=heading.querySelectorAll('em');return nodes.length===6&&nodes[0]?.nodeValue===titleLine&&nodes[2]?.nodeValue===`${home} `&&emphasis.length===2&&emphasis[0].textContent===away&&emphasis[1].textContent===accentLine;};renderHeading();headingObserver=new MutationObserver(()=>{if(!isCorrect())renderHeading();});headingObserver.observe(heading,{childList:true,characterData:true,subtree:true});}
    text('.hero-description',settings.hero_description);text('.hero-caption h3',settings.hero_caption);text('.about-kicker h2',settings.about_title);
    const about=document.querySelectorAll('.about-copy>p');if(about[0]&&settings.about_text_1)about[0].textContent=settings.about_text_1;if(about[1]&&settings.about_text_2)about[1].textContent=settings.about_text_2;
    text('.amenities-intro h2',settings.amenities_title);text('.amenities-intro>p',settings.amenities_description);
    document.querySelectorAll('.amenity').forEach((item,index)=>{text(`.amenity:nth-child(${index+1}) h3`,settings[`amenity_${index+1}_title`]);text(`.amenity:nth-child(${index+1}) p`,settings[`amenity_${index+1}_text`]);});
    const footer=document.querySelector('.footer-grid>div:last-child');if(footer){footer.querySelector('.social-links')?.remove();const links=[['Facebook',settings.facebook_url],['Zalo',settings.zalo_url],['YouTube',settings.youtube_url]].filter(([,url])=>/^https?:\/\//i.test(url||''));if(links.length){const wrap=document.createElement('div');wrap.className='social-links';for(const [label,url] of links){const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noreferrer';link.textContent=label;wrap.append(link);}footer.append(wrap);}}
    return()=>headingObserver?.disconnect();
  },[settings]);
  return null;
}
