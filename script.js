const header=document.querySelector('.site-header');
const menuBtn=document.querySelector('.menu-btn');
const mobileMenu=document.querySelector('.mobile-menu');
window.addEventListener('scroll',()=>header.classList.toggle('scrolled',window.scrollY>35));
menuBtn?.addEventListener('click',()=>{
  const open=menuBtn.classList.toggle('active');
  mobileMenu.classList.toggle('open',open);
  menuBtn.setAttribute('aria-expanded',open);
  mobileMenu.setAttribute('aria-hidden',!open);
});
mobileMenu?.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{menuBtn.classList.remove('active');mobileMenu.classList.remove('open')}));
const observer=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');observer.unobserve(e.target)}}),{threshold:.12,rootMargin:'0px 0px -30px'});
document.querySelectorAll('.reveal').forEach(el=>observer.observe(el));

const leadForm=document.querySelector('#lead-form');
leadForm?.addEventListener('submit',e=>{
  e.preventDefault();
  const data=new FormData(leadForm);
  const subject=encodeURIComponent('Заявка з liqevent.com — '+(data.get('type')||'Подія'));
  const body=encodeURIComponent(`Ім'я: ${data.get('name')}\nКонтакт: ${data.get('contact')}\nФормат: ${data.get('type')}\n\nЗадача:\n${data.get('message')||'-'}`);
  window.location.href=`mailto:liqevent@gmail.com?subject=${subject}&body=${body}`;
});
