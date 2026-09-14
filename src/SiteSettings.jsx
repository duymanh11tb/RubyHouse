import {useEffect} from 'react';

const tel=value=>`tel:+84${String(value||'').replace(/\D/g,'').replace(/^0/,'')}`;

export default function SiteSettings({settings={}}){
  useEffect(()=>{
    const text=(selector,value)=>{const element=document.querySelector(selector);if(element&&value)element.textContent=value;};
    document.querySelectorAll('a[href^="tel:"]').forEach((link,index)=>{
      const slot=link.dataset.sitePhone||(index%2===0?'primary':'secondary');link.dataset.sitePhone=slot;
      const value=slot==='primary'?settings.phone_primary:settings.phone_secondary;if(value){link.textContent=value;link.href=tel(value);}
    });
    document.querySelectorAll('footer a[href^="mailto:"],.contact-phone a[href^="mailto:"]').forEach((link,index)=>{if(settings.email_contact){link.textContent=settings.email_contact;link.href=`mailto:${settings.email_contact}`;}if(index>0)link.remove();});
    document.querySelectorAll('.brand-logo').forEach(image=>{if(settings.logo_url)image.src=settings.logo_url;});
    const heading=document.querySelector('.hero-copy h1');if(heading){const first=[...heading.childNodes].find(node=>node.nodeType===Node.TEXT_NODE);if(first&&settings.hero_title)first.nodeValue=settings.hero_title;const accent=heading.querySelector('em');if(accent&&settings.hero_accent)accent.textContent=settings.hero_accent;}
    text('.hero-description',settings.hero_description);text('.hero-caption h3',settings.hero_caption);text('.about-kicker h2',settings.about_title);
    const about=document.querySelectorAll('.about-copy>p');if(about[0]&&settings.about_text_1)about[0].textContent=settings.about_text_1;if(about[1]&&settings.about_text_2)about[1].textContent=settings.about_text_2;
    text('.amenities-intro h2',settings.amenities_title);text('.amenities-intro>p',settings.amenities_description);
    document.querySelectorAll('.amenity').forEach((item,index)=>{text(`.amenity:nth-child(${index+1}) h3`,settings[`amenity_${index+1}_title`]);text(`.amenity:nth-child(${index+1}) p`,settings[`amenity_${index+1}_text`]);});
    const footer=document.querySelector('.footer-grid>div:last-child');if(footer){footer.querySelector('.social-links')?.remove();const links=[['Facebook',settings.facebook_url],['Zalo',settings.zalo_url],['YouTube',settings.youtube_url]].filter(([,url])=>/^https?:\/\//i.test(url||''));if(links.length){const wrap=document.createElement('div');wrap.className='social-links';for(const [label,url] of links){const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noreferrer';link.textContent=label;wrap.append(link);}footer.append(wrap);}}
  },[settings]);
  return null;
}
