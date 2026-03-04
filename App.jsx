import { useState, useMemo, useEffect, useCallback } from "react";

// ─────────────────────────────────────────────────────────────────────────────
//  SUPABASE CONFIG — Replace with your own from:
//  supabase.com → Your Project → Settings → API
// ─────────────────────────────────────────────────────────────────────────────
const SUPABASE_URL  = "https://udabkxvdpyzkrmvtmuvz.supabase.co";
const SUPABASE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkYWJreHZkcHl6a3JtdnRtdXZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1OTcyNDIsImV4cCI6MjA4ODE3MzI0Mn0.e4Ipa3VvL-sdZHjl6bvsVyn_Jj6GPTkGefiClctR37c";

// Simple Supabase REST helper (no SDK needed)
const sb = {
  async get(table, params = "") {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
    });
    return r.json();
  },
  async insert(table, body) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify(body)
    });
    return r.json();
  },
  async update(table, id, body) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: "PATCH",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify(body)
    });
    return r.json();
  },
  async delete(table, id) {
    await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
      method: "DELETE",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
    });
  }
};

const TABS = ["Dashboard","Calendar","Raw Materials","Production","Workers & Wages","Sales","Rejection Tracker","Profit Analysis","Monthly Track","Yearly Track"];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fmt = n => "Rs." + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });

const IS = { width:"100%", background:"#231008", border:"1px solid #4d1a08", borderRadius:6, padding:"7px 10px", color:"#f5e6d3", fontSize:13, fontFamily:"Georgia,serif", boxSizing:"border-box", marginBottom:10 };
const LS = { display:"block", color:"#9a6040", fontSize:12, marginBottom:3 };

function Field({ label, name, type="text", value, onChange }) {
  return <div><label style={LS}>{label}</label><input style={IS} type={type} name={name} value={value??""} onChange={e=>onChange(e.target.name,e.target.value)}/></div>;
}
function SelF({ label, value, onChange, children }) {
  return <div><label style={LS}>{label}</label><select style={IS} value={value} onChange={onChange}>{children}</select></div>;
}

export default function App() {
  const [showPro, setShowPro] = useState(false);
  const [tab, setTab] = useState("Dashboard");
  const [data, setData] = useState({ rawMaterials:[], workers:[], production:[], sales:[], overheads:[], rejections:[] });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [calDate, setCalDate] = useState(new Date(2026,2,1));
  const [selDay, setSelDay] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);

  // ── Load all data from Supabase ──────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [rm, wk, pr, sl, oh, rj] = await Promise.all([
        sb.get("raw_materials","order=id"),
        sb.get("workers","order=id"),
        sb.get("production","order=date.desc"),
        sb.get("sales","order=date.desc"),
        sb.get("overheads","order=id"),
        sb.get("rejections","order=date.desc"),
      ]);
      // Map snake_case DB columns → camelCase app fields
      setData({
        rawMaterials: (rm||[]).map(r=>({id:r.id,name:r.name,unit:r.unit,stock:+r.stock,costPerUnit:+r.cost_per_unit,reorderLevel:+r.reorder_level})),
        workers:      (wk||[]).map(r=>({id:r.id,name:r.name,role:r.role,dailyWage:+r.daily_wage,daysWorked:+r.days_worked,active:r.active})),
        production:   (pr||[]).map(r=>({id:r.id,date:r.date,batchName:r.batch_name,bricksMade:+r.bricks_made,clayUsed:+r.clay_used,sandUsed:+r.sand_used,coalUsed:+r.coal_used,waterUsed:+r.water_used,status:r.status})),
        sales:        (sl||[]).map(r=>({id:r.id,date:r.date,buyer:r.buyer,quantity:+r.quantity,pricePerK:+r.price_per_k,paid:r.paid})),
        overheads:    (oh||[]).map(r=>({id:r.id,name:r.name,monthlyCost:+r.monthly_cost})),
        rejections:   (rj||[]).map(r=>({id:r.id,date:r.date,batchName:r.batch_name,totalMade:+r.total_made,rejected:+r.rejected,reason:r.reason})),
      });
    } catch(e) { console.error("Load error:", e); }
    setLoading(false);
  }, []);

  useEffect(()=>{ loadAll(); },[]);

  // ── Computed stats ────────────────────────────────────────
  const bCost = b => b.clayUsed*800+b.sandUsed*200+b.coalUsed*12000+b.waterUsed*50;
  const wages    = data.workers.reduce((s,w)=>s+w.dailyWage*w.daysWorked,0);
  const overhead = data.overheads.reduce((s,o)=>s+o.monthlyCost,0);
  const matCost  = data.production.reduce((s,b)=>s+bCost(b),0);
  const totBricks= data.production.reduce((s,b)=>s+b.bricksMade,0);
  const totCost  = matCost+wages+overhead;
  const cpb      = totBricks>0?totCost/totBricks:0;
  const revenue  = data.sales.reduce((s,x)=>s+(x.quantity/1000)*x.pricePerK,0);
  const collected= data.sales.filter(x=>x.paid).reduce((s,x)=>s+(x.quantity/1000)*x.pricePerK,0);
  const soldBricks=data.sales.reduce((s,x)=>s+x.quantity,0);
  const profit   = revenue-(totBricks>0?(soldBricks/totBricks)*totCost:0);
  const margin   = revenue>0?((profit/revenue)*100).toFixed(1):0;
  const lowStock = data.rawMaterials.filter(m=>m.stock<=m.reorderLevel);

  const openM  = (type,item={})=>{setModal(type);setForm({...item});};
  const closeM = ()=>{setModal(null);setForm({});};
  const sf     = (k,v)=>setForm(f=>({...f,[k]:v}));

  // ── Save helpers ──────────────────────────────────────────
  const doSave = async (table, dbRow, localKey, toLocal) => {
    setSaving(true);
    try {
      if(form.id) {
        await sb.update(table, form.id, dbRow);
        setData(d=>({...d,[localKey]:d[localKey].map(x=>x.id===form.id?{...toLocal,id:form.id}:x)}));
      } else {
        const res = await sb.insert(table, dbRow);
        const newId = Array.isArray(res)&&res[0]?res[0].id:Date.now();
        setData(d=>({...d,[localKey]:[...d[localKey],{...toLocal,id:newId}]}));
      }
    } catch(e){ console.error("Save error",e); await loadAll(); }
    setSaving(false); closeM();
  };

  const saveW   = ()=>doSave("workers",    {name:form.name,role:form.role,daily_wage:+form.dailyWage,days_worked:+form.daysWorked,active:true},     "workers",    {name:form.name,role:form.role,dailyWage:+form.dailyWage,daysWorked:+form.daysWorked,active:true});
  const saveS   = ()=>doSave("sales",      {date:form.date,buyer:form.buyer,quantity:+form.quantity,price_per_k:+form.pricePerK,paid:!!form.paid},   "sales",      {date:form.date,buyer:form.buyer,quantity:+form.quantity,pricePerK:+form.pricePerK,paid:!!form.paid});
  const saveMat = ()=>doSave("raw_materials",{name:form.name,unit:form.unit,stock:+form.stock,cost_per_unit:+form.costPerUnit,reorder_level:+form.reorderLevel},"rawMaterials",{name:form.name,unit:form.unit,stock:+form.stock,costPerUnit:+form.costPerUnit,reorderLevel:+form.reorderLevel});
  const saveB   = ()=>doSave("production", {date:form.date,batch_name:form.batchName,bricks_made:+form.bricksMade,clay_used:+form.clayUsed,sand_used:+form.sandUsed,coal_used:+form.coalUsed,water_used:+form.waterUsed,status:form.status||"In Progress"},"production",{date:form.date,batchName:form.batchName,bricksMade:+form.bricksMade,clayUsed:+form.clayUsed,sandUsed:+form.sandUsed,coalUsed:+form.coalUsed,waterUsed:+form.waterUsed,status:form.status||"In Progress"});
  const saveO   = ()=>doSave("overheads",  {name:form.name,monthly_cost:+form.monthlyCost},  "overheads",  {name:form.name,monthlyCost:+form.monthlyCost});
  const saveRej = ()=>doSave("rejections", {date:form.date,batch_name:form.batchName,total_made:+form.totalMade,rejected:+form.rejected,reason:form.reason},"rejections",{date:form.date,batchName:form.batchName,totalMade:+form.totalMade,rejected:+form.rejected,reason:form.reason});

  // ── Delete helpers ────────────────────────────────────────
  const doDelete = async (table, id, localKey) => {
    setSaving(true);
    try {
      await sb.delete(table, id);
      setData(d=>({...d,[localKey]:d[localKey].filter(x=>x.id!==id)}));
    } catch(e){ await loadAll(); }
    setSaving(false); setConfirmDel(null);
  };
  const delBatch  = id=>doDelete("production",   id,"production");
  const delWorker = id=>doDelete("workers",       id,"workers");
  const delMat    = id=>doDelete("raw_materials", id,"rawMaterials");
  const delSale   = id=>doDelete("sales",         id,"sales");
  const delRej    = id=>doDelete("rejections",    id,"rejections");
  const markPaid  = async id=>{
    await sb.update("sales",id,{paid:true});
    setData(d=>({...d,sales:d.sales.map(s=>s.id===id?{...s,paid:true}:s)}));
  };

  const getMK = s=>s?s.substring(0,7):"";
  const getMD = ym=>{
    const prod=data.production.filter(b=>getMK(b.date)===ym);
    const sales=data.sales.filter(s=>getMK(s.date)===ym);
    const mB=prod.reduce((s,b)=>s+b.bricksMade,0);
    const mM=prod.reduce((s,b)=>s+bCost(b),0);
    const mR=sales.reduce((s,x)=>s+(x.quantity/1000)*x.pricePerK,0);
    const mS=sales.reduce((s,x)=>s+x.quantity,0);
    const has=prod.length>0||sales.length>0;
    const mT=has?mM+wages+overhead:0;
    const mP=has?mR-(mB>0?(mS/mB)*mT:0):0;
    return {prod,sales,mB,mM,mR,mT,mP};
  };

  const C = {
    card: {background:"linear-gradient(145deg,#231008,#160905)",border:"1px solid #4d1a08",borderRadius:10,padding:18},
    grid: {display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:14,marginBottom:22},
    sec:  {fontSize:16,fontWeight:"bold",color:"#f5c87a",borderLeft:"4px solid #7a1515",paddingLeft:10,marginBottom:14},
    tbl:  {width:"100%",borderCollapse:"collapse",fontSize:13},
    th:   {background:"#280808",color:"#f5c87a",padding:"9px 11px",textAlign:"left",fontFamily:"Georgia,serif",borderBottom:"2px solid #4d1a08"},
    td:   {padding:"8px 11px",borderBottom:"1px solid #200d06",color:"#eeddc8"},
    btn:  {padding:"7px 14px",borderRadius:6,border:"none",cursor:"pointer",fontSize:12,fontFamily:"Georgia,serif",fontWeight:"bold",background:"#7a1515",color:"#f5c87a"},
    sbtn: c=>({padding:"4px 9px",fontSize:11,borderRadius:4,border:"none",cursor:"pointer",fontFamily:"Georgia,serif",background:c==="g"?"#1a3a1a":c==="r"?"#3a0a0a":"#3d1a0a",color:c==="g"?"#90ee90":c==="r"?"#ff7070":"#f5c87a",marginRight:4}),
    badge:t=>({padding:"3px 8px",borderRadius:20,fontSize:11,fontWeight:"bold",display:"inline-block",background:t==="g"?"#1a3a1a":t==="w"?"#3a2800":"#3a0000",color:t==="g"?"#90ee90":t==="w"?"#ffd700":"#ff7070"}),
    mbox: {background:"#180905",border:"2px solid #7a1515",borderRadius:12,padding:24,width:"90%",maxWidth:490,maxHeight:"90vh",overflowY:"auto"},
    mt:   {fontSize:15,fontWeight:"bold",color:"#f5c87a",marginBottom:14,borderBottom:"1px solid #4d1a08",paddingBottom:10},
  };
  const nb   = a=>({padding:"11px 14px",border:"none",cursor:"pointer",fontSize:12,fontFamily:"Georgia,serif",background:a?"#7a1515":"transparent",color:a?"#f5c87a":"#9a6040",borderBottom:a?"3px solid #f5c87a":"3px solid transparent",whiteSpace:"nowrap"});
  const cBtn = {...C.btn,background:"#231008",color:"#9a6040"};
  const dBtn = {...C.btn,background:"#3a0808",color:"#ff7070"};

  // ── Loading overlay ───────────────────────────────────────
  if(loading) return (
    <div style={{minHeight:"100vh",background:"#0f0704",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"Georgia,serif",color:"#f5c87a",flexDirection:"column",gap:16}}>
      <div style={{fontSize:48}}>🧱</div>
      <div style={{fontSize:16}}>Loading data from Supabase...</div>
      <div style={{fontSize:12,color:"#9a6040"}}>Connecting to database</div>
    </div>
  );

  // ── CALENDAR ──────────────────────────────────────────────
  const CalendarTab = () => {
    const yr=calDate.getFullYear(), mo=calDate.getMonth();
    const fd=new Date(yr,mo,1).getDay(), dim=new Date(yr,mo+1,0).getDate();
    const ym=`${yr}-${String(mo+1).padStart(2,"0")}`;
    const ms=getMD(ym);
    const dayMap=useMemo(()=>{
      const m={};
      data.production.forEach(b=>{const d=b.date.substring(0,10);if(!m[d])m[d]={p:[],s:[]};m[d].p.push(b);});
      data.sales.forEach(s=>{const d=s.date.substring(0,10);if(!m[d])m[d]={p:[],s:[]};m[d].s.push(s);});
      return m;
    },[data]);
    const t=new Date(); const ts=`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${String(t.getDate()).padStart(2,"0")}`;
    return (
      <div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:12,marginBottom:20}}>
          {[{l:"Bricks Produced",v:ms.mB.toLocaleString(),c:"#f5c87a"},{l:"Revenue",v:fmt(ms.mR),c:"#f5c87a"},{l:"Total Cost",v:fmt(ms.mT),c:"#f5c87a"},{l:"Net Profit",v:fmt(ms.mP),c:ms.mP>=0?"#90ee90":"#ff7070"},{l:"Batches",v:ms.prod.length,c:"#f5c87a"},{l:"Sales",v:ms.sales.length,c:"#f5c87a"}].map((x,i)=>(
            <div key={i} style={{...C.card,padding:"12px 14px"}}>
              <div style={{fontSize:10,color:"#9a6040",textTransform:"uppercase",letterSpacing:1,marginBottom:3}}>{x.l}</div>
              <div style={{fontSize:17,fontWeight:"bold",color:x.c}}>{x.v}</div>
            </div>
          ))}
        </div>
        <div style={C.card}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
            <button onClick={()=>setCalDate(new Date(yr,mo-1,1))} style={{...C.btn,padding:"5px 14px"}}>←</button>
            <div style={{fontSize:18,fontWeight:"bold",color:"#f5c87a"}}>{MONTHS[mo]} {yr}</div>
            <button onClick={()=>setCalDate(new Date(yr,mo+1,1))} style={{...C.btn,padding:"5px 14px"}}>→</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3,marginBottom:4}}>
            {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d=><div key={d} style={{textAlign:"center",fontSize:11,color:"#9a6040",padding:"4px 0",fontWeight:"bold"}}>{d}</div>)}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3}}>
            {Array(fd).fill(null).map((_,i)=><div key={"e"+i}/>)}
            {Array(dim).fill(null).map((_,i)=>{
              const day=i+1;
              const ds=`${yr}-${String(mo+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
              const dd=dayMap[ds]; const hp=dd&&dd.p.length>0; const hs=dd&&dd.s.length>0;
              const isTd=ds===ts; const isSel=selDay===ds;
              return (
                <div key={day} onClick={()=>setSelDay(isSel?null:ds)} style={{minHeight:54,background:isSel?"#4d1a08":hp||hs?"rgba(122,21,21,0.25)":"rgba(255,255,255,0.03)",borderRadius:6,border:isSel?"2px solid #f5c87a":isTd?"2px solid #a83010":"1px solid #2d1510",padding:"4px 6px",cursor:"pointer"}}>
                  <div style={{fontSize:12,fontWeight:isTd?"bold":"normal",color:isTd?"#f5c87a":"#c08060"}}>{day}</div>
                  {hp&&<div><span style={{fontSize:9,background:"#7a1515",color:"#f5c87a",borderRadius:3,padding:"1px 4px"}}>{dd.p.length}B</span></div>}
                  {hs&&<div><span style={{fontSize:9,background:"#1a3a1a",color:"#90ee90",borderRadius:3,padding:"1px 4px"}}>{dd.s.length}S</span></div>}
                </div>
              );
            })}
          </div>
          <div style={{marginTop:10,display:"flex",gap:14,fontSize:11,color:"#9a6040"}}>
            <span><span style={{background:"#7a1515",color:"#f5c87a",borderRadius:3,padding:"1px 5px",fontSize:9}}>B</span> = Batch</span>
            <span><span style={{background:"#1a3a1a",color:"#90ee90",borderRadius:3,padding:"1px 5px",fontSize:9}}>S</span> = Sale</span>
          </div>
        </div>
        {selDay&&(()=>{
          const dd=dayMap[selDay]||{p:[],s:[]};
          const dR=dd.s.reduce((s,x)=>s+(x.quantity/1000)*x.pricePerK,0);
          const dB=dd.p.reduce((s,b)=>s+b.bricksMade,0);
          const dM=dd.p.reduce((s,b)=>s+bCost(b),0);
          return (
            <div style={{...C.card,marginTop:14}}>
              <div style={C.sec}>📅 {selDay} — Day Summary</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:12,marginBottom:14}}>
                {[{l:"Bricks",v:dB.toLocaleString(),c:"#f5c87a"},{l:"Mat.Cost",v:fmt(dM),c:"#f5c87a"},{l:"Revenue",v:fmt(dR),c:"#90ee90"},{l:"Batches",v:dd.p.length,c:"#f5c87a"}].map((x,i)=>(
                  <div key={i} style={{background:"#1e0905",borderRadius:8,padding:12}}>
                    <div style={{fontSize:10,color:"#9a6040",marginBottom:3}}>{x.l}</div>
                    <div style={{fontSize:15,fontWeight:"bold",color:x.c}}>{x.v}</div>
                  </div>
                ))}
              </div>
              {dd.p.map((b,i)=><div key={i} style={{background:"#1e0905",borderRadius:7,padding:"9px 12px",marginBottom:7}}><div style={{display:"flex",justifyContent:"space-between"}}><b style={{fontSize:13}}>{b.batchName}</b><span style={C.badge(b.status==="Completed"?"g":"w")}>{b.status}</span></div><div style={{fontSize:12,color:"#9a6040",marginTop:3}}>{b.bricksMade.toLocaleString()} bricks · {fmt(bCost(b))}</div></div>)}
              {dd.s.map((s,i)=><div key={i} style={{background:"#1e0905",borderRadius:7,padding:"9px 12px",marginBottom:7}}><div style={{display:"flex",justifyContent:"space-between"}}><b style={{fontSize:13}}>{s.buyer}</b><span style={C.badge(s.paid?"g":"w")}>{s.paid?"Paid":"Pending"}</span></div><div style={{fontSize:12,color:"#9a6040",marginTop:3}}>{s.quantity.toLocaleString()} bricks · {fmt((s.quantity/1000)*s.pricePerK)}</div></div>)}
              {dd.p.length===0&&dd.s.length===0&&<div style={{color:"#9a6040",fontSize:13,textAlign:"center",padding:16}}>No activity on this day.</div>}
            </div>
          );
        })()}
      </div>
    );
  };

  // ── MONTHLY TRACK ─────────────────────────────────────────
  const MonthlyTrack = () => {
    const allM=useMemo(()=>{const s=new Set();data.production.forEach(b=>s.add(getMK(b.date)));data.sales.forEach(x=>s.add(getMK(x.date)));return Array.from(s).filter(Boolean).sort().reverse();},[]);
    const [selM,setSelM]=useState(allM[0]||"");
    const md=getMD(selM); const [y,m]=selM.split("-");
    return (
      <div>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:18}}>
          <div style={C.sec}>Monthly Tracker</div>
          <select style={{...IS,width:"auto",marginBottom:0}} value={selM} onChange={e=>setSelM(e.target.value)}>
            {allM.map(x=><option key={x} value={x}>{MONTHS[parseInt(x.split("-")[1])-1]} {x.split("-")[0]}</option>)}
          </select>
        </div>
        <div style={C.grid}>
          {[{l:"Bricks Produced",v:md.mB.toLocaleString(),c:"#f5c87a"},{l:"Revenue",v:fmt(md.mR),c:"#f5c87a"},{l:"Material Cost",v:fmt(md.mM),c:"#f5c87a"},{l:"Total Cost",v:fmt(md.mT),c:"#f5c87a"},{l:"Net Profit",v:fmt(md.mP),c:md.mP>=0?"#90ee90":"#ff7070"},{l:"Batches Run",v:md.prod.length,c:"#f5c87a"}].map((x,i)=>(
            <div key={i} style={C.card}><div style={{fontSize:10,color:"#9a6040",textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>{x.l}</div><div style={{fontSize:20,fontWeight:"bold",color:x.c}}>{x.v}</div></div>
          ))}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
          <div style={C.card}>
            <div style={C.sec}>Production — {MONTHS[parseInt(m)-1]} {y}</div>
            {md.prod.length===0?<div style={{color:"#9a6040",fontSize:13}}>No production this month.</div>:md.prod.map((b,i)=>(
              <div key={i} style={{background:"#1e0905",borderRadius:7,padding:"9px 12px",marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><b style={{fontSize:13}}>{b.batchName}</b><span style={C.badge(b.status==="Completed"?"g":"w")}>{b.status}</span></div>
                <div style={{fontSize:12,color:"#9a6040"}}>{b.bricksMade.toLocaleString()} bricks · {fmt(bCost(b))}</div>
              </div>
            ))}
          </div>
          <div style={C.card}>
            <div style={C.sec}>Sales — {MONTHS[parseInt(m)-1]} {y}</div>
            {md.sales.length===0?<div style={{color:"#9a6040",fontSize:13}}>No sales this month.</div>:md.sales.map((s,i)=>(
              <div key={i} style={{background:"#1e0905",borderRadius:7,padding:"9px 12px",marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><b style={{fontSize:13}}>{s.buyer}</b><span style={C.badge(s.paid?"g":"w")}>{s.paid?"Paid":"Pending"}</span></div>
                <div style={{fontSize:12,color:"#9a6040"}}>{s.quantity.toLocaleString()} bricks · <span style={{color:"#f5c87a",fontWeight:"bold"}}>{fmt((s.quantity/1000)*s.pricePerK)}</span></div>
              </div>
            ))}
          </div>
        </div>
        <div style={C.card}>
          <div style={C.sec}>Cost Statement — {MONTHS[parseInt(m)-1]} {y}</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
            {[["Material Cost",md.mM,"#f5c87a"],["Wages",wages,"#f5c87a"],["Overheads",overhead,"#f5c87a"],["Total Cost",md.mT,"#f5c87a"],["Revenue",md.mR,"#90ee90"],["Net Profit",md.mP,md.mP>=0?"#90ee90":"#ff7070"]].map(([l,v,c],i)=>(
              <div key={i} style={{background:"#1e0905",borderRadius:8,padding:"12px 14px"}}><div style={{fontSize:11,color:"#9a6040",marginBottom:4}}>{l}</div><div style={{fontSize:16,fontWeight:"bold",color:c}}>{fmt(v)}</div></div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // ── YEARLY TRACK ──────────────────────────────────────────
  const YearlyTrack = () => {
    const allY=useMemo(()=>{const s=new Set();data.production.forEach(b=>s.add(b.date.substring(0,4)));data.sales.forEach(x=>s.add(x.date.substring(0,4)));return Array.from(s).sort().reverse();},[]);
    const [selY,setSelY]=useState(allY[0]||"2026");
    const yms=useMemo(()=>Array.from({length:12},(_,i)=>{const mo=String(i+1).padStart(2,"0");const d=getMD(`${selY}-${mo}`);return {name:MONTHS[i],...d};}),[selY]);
    const tot=yms.reduce((a,m)=>({b:a.b+m.mB,r:a.r+m.mR,c:a.c+m.mT,p:a.p+m.mP,bt:a.bt+m.prod.length,s:a.s+m.sales.length}),{b:0,r:0,c:0,p:0,bt:0,s:0});
    const mxR=Math.max(...yms.map(m=>m.mR),1);
    return (
      <div>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:18}}>
          <div style={C.sec}>Yearly Tracker</div>
          <select style={{...IS,width:"auto",marginBottom:0}} value={selY} onChange={e=>setSelY(e.target.value)}>
            {allY.map(y=><option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div style={C.grid}>
          {[{l:"Total Bricks",v:tot.b.toLocaleString(),c:"#f5c87a"},{l:"Total Revenue",v:fmt(tot.r),c:"#f5c87a"},{l:"Total Cost",v:fmt(tot.c),c:"#f5c87a"},{l:"Total Profit",v:fmt(tot.p),c:tot.p>=0?"#90ee90":"#ff7070"},{l:"Total Batches",v:tot.bt,c:"#f5c87a"},{l:"Total Sales",v:tot.s,c:"#f5c87a"}].map((x,i)=>(
            <div key={i} style={C.card}><div style={{fontSize:10,color:"#9a6040",textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>{x.l}</div><div style={{fontSize:20,fontWeight:"bold",color:x.c}}>{x.v}</div><div style={{fontSize:10,color:"#7a5040",marginTop:2}}>{selY} total</div></div>
          ))}
        </div>
        <div style={{...C.card,marginBottom:14}}>
          <div style={C.sec}>Revenue vs Profit — {selY}</div>
          <div style={{display:"flex",gap:4,alignItems:"flex-end",height:130,marginBottom:6}}>
            {yms.map((m,i)=>{const rh=mxR>0?(m.mR/mxR)*110:0;const ph=mxR>0?(Math.max(0,m.mP)/mxR)*110:0;return <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center"}}><div style={{display:"flex",gap:2,alignItems:"flex-end",height:120}}><div style={{width:9,height:rh,background:"#7a1515",borderRadius:"3px 3px 0 0",minHeight:2}}/><div style={{width:9,height:ph,background:"#90ee90",borderRadius:"3px 3px 0 0",minHeight:m.mP>0?2:0,opacity:m.mP>0?1:0.3}}/></div><div style={{fontSize:8,color:"#9a6040",transform:"rotate(-45deg)",transformOrigin:"center",whiteSpace:"nowrap",marginTop:4}}>{m.name}</div></div>;})}
          </div>
          <div style={{display:"flex",gap:14,fontSize:11,color:"#9a6040"}}><span><span style={{display:"inline-block",width:9,height:9,background:"#7a1515",borderRadius:2,marginRight:4}}/>Revenue</span><span><span style={{display:"inline-block",width:9,height:9,background:"#90ee90",borderRadius:2,marginRight:4}}/>Profit</span></div>
        </div>
        <div style={{...C.card,padding:0,overflow:"auto"}}>
          <table style={C.tbl}>
            <thead><tr>{["Month","Bricks","Revenue","Cost","Profit","Margin","Batches","Sales"].map(h=><th key={h} style={C.th}>{h}</th>)}</tr></thead>
            <tbody>
              {yms.map((m,i)=>{const has=m.mB>0||m.mR>0;const mg=m.mR>0?((m.mP/m.mR)*100).toFixed(0)+"%":"—";return <tr key={i} style={{background:has?(i%2===0?"rgba(255,255,255,0.015)":""):"",opacity:has?1:0.45}}>
                <td style={{...C.td,fontWeight:"bold",color:"#f5c87a"}}>{m.name}</td>
                <td style={C.td}>{m.mB>0?m.mB.toLocaleString():"—"}</td>
                <td style={C.td}>{m.mR>0?fmt(m.mR):"—"}</td>
                <td style={C.td}>{m.mT>0?fmt(m.mT):"—"}</td>
                <td style={{...C.td,color:m.mP>0?"#90ee90":m.mP<0?"#ff7070":"#9a6040",fontWeight:"bold"}}>{m.mR>0?fmt(m.mP):"—"}</td>
                <td style={C.td}>{mg}</td><td style={C.td}>{m.prod.length>0?m.prod.length:"—"}</td><td style={C.td}>{m.sales.length>0?m.sales.length:"—"}</td>
              </tr>;})}
            </tbody>
            <tfoot><tr style={{background:"#280808"}}><td style={{...C.td,color:"#f5c87a",fontWeight:"bold"}}>TOTAL</td><td style={{...C.td,color:"#f5c87a",fontWeight:"bold"}}>{tot.b.toLocaleString()}</td><td style={{...C.td,color:"#f5c87a",fontWeight:"bold"}}>{fmt(tot.r)}</td><td style={{...C.td,color:"#f5c87a",fontWeight:"bold"}}>{fmt(tot.c)}</td><td style={{...C.td,color:tot.p>=0?"#90ee90":"#ff7070",fontWeight:"bold"}}>{fmt(tot.p)}</td><td style={{...C.td,color:tot.p>=0?"#90ee90":"#ff7070",fontWeight:"bold"}}>{tot.r>0?((tot.p/tot.r)*100).toFixed(0)+"%":"—"}</td><td style={{...C.td,color:"#f5c87a",fontWeight:"bold"}}>{tot.bt}</td><td style={{...C.td,color:"#f5c87a",fontWeight:"bold"}}>{tot.s}</td></tr></tfoot>
          </table>
        </div>
      </div>
    );
  };

  // ── DASHBOARD ─────────────────────────────────────────────
  const Dashboard = () => (
    <div>
      {lowStock.length>0&&<div style={{background:"#280000",border:"1px solid #7a1515",borderRadius:8,padding:"10px 14px",marginBottom:18,display:"flex",gap:10,alignItems:"center"}}><span>⚠</span><span style={{color:"#ff9966"}}><b>Low Stock Alert:</b> {lowStock.map(m=>m.name).join(", ")} need reorder!</span></div>}
      <div style={C.grid}>
        {[{l:"Total Bricks Produced",v:totBricks.toLocaleString(),s:"units this period",c:"#f5c87a"},{l:"Total Revenue",v:fmt(revenue),s:"Collected: "+fmt(collected),c:"#f5c87a"},{l:"Production Cost",v:fmt(totCost),s:fmt(cpb*1000)+" per 1000",c:"#f5c87a"},{l:"Net Profit",v:fmt(profit),s:"Margin: "+margin+"%",c:profit>=0?"#90ee90":"#ff7070"},{l:"Total Workers",v:data.workers.length,s:"Wages: "+fmt(wages),c:"#f5c87a"},{l:"Pending Payments",v:fmt(revenue-collected),s:data.sales.filter(s=>!s.paid).length+" invoices",c:"#ffd700"}].map((x,i)=>(
          <div key={i} style={C.card}><div style={{fontSize:11,color:"#9a6040",textTransform:"uppercase",letterSpacing:1.2,marginBottom:4}}>{x.l}</div><div style={{fontSize:20,fontWeight:"bold",color:x.c}}>{x.v}</div><div style={{fontSize:11,color:"#b07050",marginTop:3}}>{x.s}</div></div>
        ))}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        <div style={C.card}>
          <div style={C.sec}>Cost Breakdown</div>
          {[["Raw Materials",matCost,"#7a1515"],["Worker Wages",wages,"#a83010"],["Overheads",overhead,"#4d1808"]].map(([l,v,cl],i)=>(
            <div key={i} style={{marginBottom:11}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:3}}><span style={{color:"#c08060"}}>{l}</span><span style={{color:"#f5c87a"}}>{fmt(v)} ({totCost>0?((v/totCost)*100).toFixed(0):0}%)</span></div>
              <div style={{background:"#200d06",borderRadius:5,height:12,overflow:"hidden"}}><div style={{height:"100%",width:(totCost>0?(v/totCost)*100:0)+"%",background:cl,borderRadius:5}}/></div>
            </div>
          ))}
        </div>
        <div style={C.card}>
          <div style={C.sec}>Recent Sales</div>
          {data.sales.slice(0,4).map((s,i)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:"1px solid #200d06"}}>
              <div><div style={{fontSize:13}}>{s.buyer}</div><div style={{fontSize:11,color:"#9a6040"}}>{s.date} — {s.quantity.toLocaleString()} bricks</div></div>
              <div style={{textAlign:"right"}}><div style={{color:"#f5c87a",fontSize:13}}>{fmt((s.quantity/1000)*s.pricePerK)}</div><span style={C.badge(s.paid?"g":"w")}>{s.paid?"Paid":"Pending"}</span></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const Materials = () => (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><div style={C.sec}>Raw Material Inventory</div><button style={C.btn} onClick={()=>openM("material")}>+ Add Material</button></div>
      <div style={{...C.card,padding:0,overflow:"hidden"}}>
        <table style={C.tbl}>
          <thead><tr>{["Material","Unit","Stock","Cost/Unit","Inventory Value","Status","Actions"].map(h=><th key={h} style={C.th}>{h}</th>)}</tr></thead>
          <tbody>{data.rawMaterials.map((m,i)=>(
            <tr key={m.id} style={{background:i%2===0?"rgba(255,255,255,0.013)":""}}>
              <td style={C.td}><b>{m.name}</b></td><td style={C.td}>{m.unit}</td><td style={C.td}>{m.stock} {m.unit}</td><td style={C.td}>{fmt(m.costPerUnit)}</td>
              <td style={{...C.td,color:"#f5c87a"}}>{fmt(m.stock*m.costPerUnit)}</td>
              <td style={C.td}><span style={C.badge(m.stock>m.reorderLevel?"g":"r")}>{m.stock>m.reorderLevel?"OK":"Reorder"}</span></td>
              <td style={C.td}><button style={C.sbtn("o")} onClick={()=>openM("material",m)}>Edit</button><button style={C.sbtn("r")} onClick={()=>setConfirmDel({id:m.id,batchName:m.name,_t:"mat"})}>Del</button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div style={{...C.card,marginTop:12,display:"flex",gap:28}}>
        <div><div style={{color:"#9a6040",fontSize:12}}>Total Inventory Value</div><div style={{color:"#f5c87a",fontSize:20,fontWeight:"bold"}}>{fmt(data.rawMaterials.reduce((s,m)=>s+m.stock*m.costPerUnit,0))}</div></div>
        <div><div style={{color:"#9a6040",fontSize:12}}>Items to Reorder</div><div style={{color:lowStock.length>0?"#ff7070":"#90ee90",fontSize:20,fontWeight:"bold"}}>{lowStock.length}</div></div>
      </div>
    </div>
  );

  const Production = () => (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><div style={C.sec}>Production Batches</div><button style={C.btn} onClick={()=>openM("batch",{date:new Date().toISOString().split("T")[0],status:"In Progress"})}>+ New Batch</button></div>
      <div style={{...C.card,padding:0,overflow:"auto"}}>
        <table style={C.tbl}>
          <thead><tr>{["Batch","Date","Bricks","Clay","Husk","Coal","Water","Mat.Cost","Cost/1000","Status","Actions"].map(h=><th key={h} style={C.th}>{h}</th>)}</tr></thead>
          <tbody>{data.production.map((b,i)=>{const mc=bCost(b);return(
            <tr key={b.id} style={{background:i%2===0?"rgba(255,255,255,0.013)":""}}>
              <td style={C.td}><b>{b.batchName}</b></td><td style={C.td}>{b.date}</td><td style={C.td}>{b.bricksMade.toLocaleString()}</td>
              <td style={C.td}>{b.clayUsed}T</td><td style={C.td}>{b.sandUsed} bags</td><td style={C.td}>{b.coalUsed}T</td><td style={C.td}>{b.waterUsed}kL</td>
              <td style={{...C.td,color:"#f5c87a"}}>{fmt(mc)}</td><td style={C.td}>{fmt((mc/b.bricksMade)*1000)}</td>
              <td style={C.td}><span style={C.badge(b.status==="Completed"?"g":"w")}>{b.status}</span></td>
              <td style={C.td}><button style={C.sbtn("o")} onClick={()=>openM("batch",b)}>Edit</button><button style={C.sbtn("r")} onClick={()=>setConfirmDel({id:b.id,batchName:b.batchName,_t:"batch"})}>Del</button></td>
            </tr>
          );})}
          </tbody>
        </table>
      </div>
      <div style={{...C.card,marginTop:12,display:"flex",gap:28,flexWrap:"wrap"}}>
        <div><div style={{color:"#9a6040",fontSize:12}}>Total Produced</div><div style={{color:"#f5c87a",fontSize:20,fontWeight:"bold"}}>{totBricks.toLocaleString()} bricks</div></div>
        <div><div style={{color:"#9a6040",fontSize:12}}>Full Cost/1000</div><div style={{color:"#f5c87a",fontSize:20,fontWeight:"bold"}}>{fmt(cpb*1000)}</div></div>
        <div><div style={{color:"#9a6040",fontSize:12}}>Total Material Cost</div><div style={{color:"#f5c87a",fontSize:20,fontWeight:"bold"}}>{fmt(matCost)}</div></div>
      </div>
    </div>
  );

  const Workers = () => (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><div style={C.sec}>Workers & Wage Register</div><button style={C.btn} onClick={()=>openM("worker",{daysWorked:26})}>+ Add Worker</button></div>
      <div style={{...C.card,padding:0,overflow:"hidden",marginBottom:16}}>
        <table style={C.tbl}>
          <thead><tr>{["Name","Role","Daily Wage","Days Worked","Monthly Wage","Status","Actions"].map(h=><th key={h} style={C.th}>{h}</th>)}</tr></thead>
          <tbody>{data.workers.map((w,i)=>(
            <tr key={w.id} style={{background:i%2===0?"rgba(255,255,255,0.013)":""}}>
              <td style={C.td}><b>{w.name}</b></td><td style={C.td}>{w.role}</td><td style={C.td}>{fmt(w.dailyWage)}/day</td><td style={C.td}>{w.daysWorked} days</td>
              <td style={{...C.td,color:"#f5c87a",fontWeight:"bold"}}>{fmt(w.dailyWage*w.daysWorked)}</td>
              <td style={C.td}><span style={C.badge(w.active?"g":"r")}>{w.active?"Active":"Inactive"}</span></td>
              <td style={C.td}><button style={C.sbtn("o")} onClick={()=>openM("worker",w)}>Edit</button><button style={C.sbtn("r")} onClick={()=>setConfirmDel({id:w.id,batchName:w.name,_t:"worker"})}>Del</button></td>
            </tr>
          ))}</tbody>
          <tfoot><tr style={{background:"#280808"}}><td colSpan={4} style={{...C.td,color:"#f5c87a",fontWeight:"bold"}}>Total Monthly Wages</td><td style={{...C.td,color:"#f5c87a",fontWeight:"bold",fontSize:15}}>{fmt(wages)}</td><td colSpan={2} style={C.td}/></tr></tfoot>
        </table>
      </div>
      <div style={C.card}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}><div style={C.sec}>Monthly Overheads</div><button style={C.btn} onClick={()=>openM("overhead",{})}>+ Add Overhead</button></div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(175px,1fr))",gap:12}}>
          {data.overheads.map(o=>(
            <div key={o.id} style={{background:"#180905",border:"1px solid #2d1510",borderRadius:8,padding:14}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}><div style={{fontSize:12,color:"#9a6040",flex:1,paddingRight:6}}>{o.name}</div><button style={{...C.sbtn("o"),padding:"2px 8px",fontSize:10,marginRight:0}} onClick={()=>openM("overhead",o)}>Edit</button></div>
              <div style={{fontSize:18,color:"#f5c87a",fontWeight:"bold"}}>{fmt(o.monthlyCost)}</div>
            </div>
          ))}
          <div style={{background:"#280808",border:"1px solid #3d1010",borderRadius:8,padding:14}}><div style={{fontSize:12,color:"#9a6040",marginBottom:6}}>Total Overheads</div><div style={{fontSize:18,color:"#f5c87a",fontWeight:"bold"}}>{fmt(overhead)}</div></div>
        </div>
      </div>
    </div>
  );

  const Sales = () => (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><div style={C.sec}>Sales Register</div><button style={C.btn} onClick={()=>openM("sale",{date:new Date().toISOString().split("T")[0],paid:false})}>+ Record Sale</button></div>
      <div style={{...C.card,padding:0,overflow:"auto"}}>
        <table style={C.tbl}>
          <thead><tr>{["Date","Buyer","Qty","Rate/1000","Total Value","Payment","Actions"].map(h=><th key={h} style={C.th}>{h}</th>)}</tr></thead>
          <tbody>{data.sales.map((s,i)=>{const val=(s.quantity/1000)*s.pricePerK;return(
            <tr key={s.id} style={{background:i%2===0?"rgba(255,255,255,0.013)":""}}>
              <td style={C.td}>{s.date}</td><td style={C.td}><b>{s.buyer}</b></td><td style={C.td}>{s.quantity.toLocaleString()}</td><td style={C.td}>{fmt(s.pricePerK)}</td>
              <td style={{...C.td,color:"#f5c87a",fontWeight:"bold"}}>{fmt(val)}</td>
              <td style={C.td}><span style={C.badge(s.paid?"g":"w")}>{s.paid?"Paid":"Pending"}</span></td>
              <td style={C.td}>
                {!s.paid&&<button style={C.sbtn("g")} onClick={()=>markPaid(s.id)}>Mark Paid</button>}
                <button style={C.sbtn("o")} onClick={()=>openM("sale",s)}>Edit</button>
                <button style={C.sbtn("r")} onClick={()=>setConfirmDel({id:s.id,batchName:s.buyer,_t:"sale"})}>Del</button>
              </td>
            </tr>
          );})}
          </tbody>
          <tfoot><tr style={{background:"#280808"}}><td colSpan={4} style={{...C.td,color:"#f5c87a",fontWeight:"bold"}}>Total Revenue</td><td style={{...C.td,color:"#f5c87a",fontWeight:"bold",fontSize:15}}>{fmt(revenue)}</td><td colSpan={2} style={{...C.td,color:"#ffd700",fontSize:12}}>Pending: {fmt(revenue-collected)}</td></tr></tfoot>
        </table>
      </div>
    </div>
  );

  const RejectionTracker = () => {
    const tM=data.rejections.reduce((s,r)=>s+r.totalMade,0),tR=data.rejections.reduce((s,r)=>s+r.rejected,0);
    const rRate=tM>0?((tR/tM)*100).toFixed(1):0,wCost=tR*cpb;
    const reasons=data.rejections.reduce((a,r)=>{a[r.reason]=(a[r.reason]||0)+r.rejected;return a;},{});
    const topR=Object.entries(reasons).sort((a,b)=>b[1]-a[1])[0];
    return (
      <div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><div style={C.sec}>Brick Rejection Tracker</div><button style={C.btn} onClick={()=>openM("rejection",{date:new Date().toISOString().split("T")[0]})}>+ Record Rejection</button></div>
        <div style={C.grid}>
          {[{l:"Total Made",v:tM.toLocaleString(),c:"#f5c87a"},{l:"Total Rejected",v:tR.toLocaleString(),c:"#ff7070"},{l:"Good Bricks",v:(tM-tR).toLocaleString(),c:"#90ee90"},{l:"Rejection Rate",v:rRate+"%",c:+rRate>5?"#ff7070":+rRate>2?"#ffd700":"#90ee90"},{l:"Waste Cost",v:fmt(wCost),c:"#ff7070"},{l:"Top Reason",v:topR?topR[0]:"None",c:"#ffd700"}].map((x,i)=>(
            <div key={i} style={C.card}><div style={{fontSize:10,color:"#9a6040",textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>{x.l}</div><div style={{fontSize:i===5?12:19,fontWeight:"bold",color:x.c}}>{x.v}</div></div>
          ))}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
          <div style={C.card}>
            <div style={C.sec}>Rejection by Reason</div>
            {Object.entries(reasons).sort((a,b)=>b[1]-a[1]).map(([r,cnt],i)=>(
              <div key={i} style={{marginBottom:12}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:3}}><span style={{color:"#c08060"}}>{r}</span><span style={{color:"#ff7070"}}>{cnt.toLocaleString()} ({tR>0?((cnt/tR)*100).toFixed(0):0}%)</span></div>
                <div style={{background:"#200d06",borderRadius:5,height:10}}><div style={{height:"100%",width:(tR>0?(cnt/tR)*100:0)+"%",background:"#7a1515",borderRadius:5}}/></div>
              </div>
            ))}
          </div>
          <div style={C.card}>
            <div style={C.sec}>Batch-wise Rate</div>
            {data.rejections.map((r,i)=>{const rate=r.totalMade>0?((r.rejected/r.totalMade)*100).toFixed(1):0;return(
              <div key={i} style={{marginBottom:11}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:3}}><span style={{color:"#e0c090"}}>{r.batchName}</span><span style={{color:+rate>5?"#ff7070":+rate>2?"#ffd700":"#90ee90",fontWeight:"bold"}}>{rate}%</span></div>
                <div style={{background:"#200d06",borderRadius:5,height:10}}><div style={{height:"100%",width:Math.min(rate*4,100)+"%",background:+rate>5?"#7a1515":+rate>2?"#7a5a00":"#1a5a1a",borderRadius:5}}/></div>
                <div style={{fontSize:11,color:"#9a6040",marginTop:2}}>{r.rejected.toLocaleString()} of {r.totalMade.toLocaleString()} — {r.reason}</div>
              </div>
            );})}
          </div>
        </div>
        <div style={{...C.card,padding:0,overflow:"auto"}}>
          <table style={C.tbl}>
            <thead><tr>{["Date","Batch","Total","Rejected","Good","Rate","Reason","Waste Cost","Actions"].map(h=><th key={h} style={C.th}>{h}</th>)}</tr></thead>
            <tbody>{data.rejections.map((r,i)=>{const rate=r.totalMade>0?((r.rejected/r.totalMade)*100).toFixed(1):0;return(
              <tr key={r.id} style={{background:i%2===0?"rgba(255,255,255,0.013)":""}}>
                <td style={C.td}>{r.date}</td><td style={C.td}><b>{r.batchName}</b></td><td style={C.td}>{r.totalMade.toLocaleString()}</td>
                <td style={{...C.td,color:"#ff7070"}}>{r.rejected.toLocaleString()}</td><td style={{...C.td,color:"#90ee90"}}>{(r.totalMade-r.rejected).toLocaleString()}</td>
                <td style={C.td}><span style={C.badge(+rate>5?"r":+rate>2?"w":"g")}>{rate}%</span></td>
                <td style={C.td}>{r.reason}</td><td style={{...C.td,color:"#ff7070"}}>{fmt(r.rejected*cpb)}</td>
                <td style={C.td}><button style={C.sbtn("o")} onClick={()=>openM("rejection",r)}>Edit</button><button style={C.sbtn("r")} onClick={()=>setConfirmDel({id:r.id,batchName:r.batchName,_t:"rej"})}>Del</button></td>
              </tr>
            );})}
            </tbody>
            <tfoot><tr style={{background:"#280808"}}><td colSpan={2} style={{...C.td,color:"#f5c87a",fontWeight:"bold"}}>TOTALS</td><td style={{...C.td,color:"#f5c87a",fontWeight:"bold"}}>{tM.toLocaleString()}</td><td style={{...C.td,color:"#ff7070",fontWeight:"bold"}}>{tR.toLocaleString()}</td><td style={{...C.td,color:"#90ee90",fontWeight:"bold"}}>{(tM-tR).toLocaleString()}</td><td style={{...C.td,color:+rRate>5?"#ff7070":+rRate>2?"#ffd700":"#90ee90",fontWeight:"bold"}}>{rRate}%</td><td style={C.td}/><td style={{...C.td,color:"#ff7070",fontWeight:"bold"}}>{fmt(wCost)}</td><td style={C.td}/></tr></tfoot>
          </table>
        </div>
      </div>
    );
  };

  const Profit = () => {
    const avgPK=soldBricks>0?(revenue/soldBricks)*1000:0,pPK=avgPK-cpb*1000;
    return (
      <div>
        <div style={C.sec}>Profit & Cost Analysis</div>
        <div style={C.grid}>
          {[{l:"Cost per 1000",v:fmt(cpb*1000),c:"#f5c87a"},{l:"Avg Price /1000",v:fmt(avgPK),c:"#f5c87a"},{l:"Profit per 1000",v:fmt(pPK),c:pPK>=0?"#90ee90":"#ff7070"},{l:"Total Net Profit",v:fmt(profit),c:profit>=0?"#90ee90":"#ff7070"},{l:"Profit Margin",v:margin+"%",c:+margin>15?"#90ee90":+margin>0?"#ffd700":"#ff7070"},{l:"Pending Collections",v:fmt(revenue-collected),c:"#ffd700"}].map((x,i)=>(
            <div key={i} style={C.card}><div style={{fontSize:11,color:"#9a6040",textTransform:"uppercase",letterSpacing:1.1,marginBottom:4}}>{x.l}</div><div style={{fontSize:20,fontWeight:"bold",color:x.c}}>{x.v}</div></div>
          ))}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
          <div style={C.card}>
            <div style={C.sec}>Full Cost Statement</div>
            {[["Raw Material Cost",matCost],["Worker Wages",wages],["Overheads",overhead]].map(([l,v],i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid #200d06",fontSize:14}}><span style={{color:"#c08060"}}>{l}</span><span>{fmt(v)}</span></div>
            ))}
            <div style={{display:"flex",justifyContent:"space-between",padding:"9px 0",fontSize:15,fontWeight:"bold",borderBottom:"2px solid #7a1515"}}><span style={{color:"#f5c87a"}}>Total Cost</span><span style={{color:"#f5c87a"}}>{fmt(totCost)}</span></div>
            <div style={{display:"flex",justifyContent:"space-between",padding:"7px 0",fontSize:14}}><span style={{color:"#c08060"}}>Total Revenue</span><span style={{color:"#90ee90"}}>{fmt(revenue)}</span></div>
            <div style={{display:"flex",justifyContent:"space-between",padding:"7px 0",fontSize:16,fontWeight:"bold"}}><span style={{color:profit>=0?"#90ee90":"#ff7070"}}>Net Profit</span><span style={{color:profit>=0?"#90ee90":"#ff7070"}}>{fmt(profit)}</span></div>
          </div>
          <div style={C.card}>
            <div style={C.sec}>Tips to Improve Profit</div>
            {[{u:true,t:"Reduce coal/fuel usage",d:"Coal at Rs.12,000/ton is your biggest cost"},{u:true,t:"Collect pending payments",d:fmt(revenue-collected)+" still outstanding"},{u:false,t:"Bulk raw material buying",d:"Negotiate 50+ ton orders for better rates"},{u:false,t:"Increase batch size",d:"Larger batches spread overhead per brick"},{u:false,t:"Reduce brick rejection rate",d:"Every rejected brick is wasted cost"}].map((x,i)=>(
              <div key={i} style={{display:"flex",gap:10,padding:"8px 0",borderBottom:"1px solid #200d06"}}><span style={{color:x.u?"#ff6060":"#ffd700",fontSize:16,flexShrink:0}}>{x.u?"!":"*"}</span><div><div style={{fontSize:13,color:"#f5c87a",fontWeight:"bold"}}>{x.t}</div><div style={{fontSize:12,color:"#9a6040",marginTop:2}}>{x.d}</div></div></div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{fontFamily:"Georgia,serif",background:"#0f0704",minHeight:"100vh",color:"#f5e6d3"}}>
      <div style={{background:"linear-gradient(135deg,#7a1515,#3d0808)",padding:"13px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:"3px solid #a83010"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{fontSize:34}}>🧱</div>
          <div>
            <div style={{fontSize:19,fontWeight:"bold",color:"#f5c87a"}}>Brick Business Manager</div>
            <div style={{fontSize:10,color:"#b07050",marginTop:1}}>Raw Materials · Production · Wages · Sales · Profit</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          {saving&&<div style={{fontSize:11,color:"#ffd700",padding:"4px 10px",background:"rgba(0,0,0,0.3)",borderRadius:20}}>💾 Saving...</div>}
          <div style={{position:"relative"}}>
            <button onClick={()=>setShowPro(p=>!p)} style={{background:"rgba(255,255,255,0.07)",border:"1px solid #5c2010",borderRadius:8,padding:"7px 12px",cursor:"pointer",display:"flex",alignItems:"center",gap:8,color:"#f5e6d3",fontFamily:"Georgia,serif"}}>
              <span style={{fontSize:20}}>👤</span>
              <div style={{textAlign:"left"}}><div style={{fontWeight:"bold",color:"#f5c87a",fontSize:12}}>Brick Business</div><div style={{fontSize:10,color:"#9a6040"}}>Public Access</div></div>
              <span style={{color:"#9a6040",fontSize:10}}>{showPro?"▲":"▼"}</span>
            </button>
            {showPro&&(
              <div style={{position:"absolute",right:0,top:"calc(100% + 8px)",background:"#1a0905",border:"1px solid #5c2010",borderRadius:12,padding:18,minWidth:210,zIndex:500,boxShadow:"0 8px 30px rgba(0,0,0,0.7)"}}>
                <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14,paddingBottom:12,borderBottom:"1px solid #2d1510"}}><div style={{fontSize:34}}>🧱</div><div><div style={{color:"#f5c87a",fontWeight:"bold",fontSize:14}}>Brick Business Manager</div><div style={{color:"#9a6040",fontSize:11}}>Public Access Mode</div></div></div>
                {[["Revenue",fmt(revenue),"#f5c87a"],["Net Profit",fmt(profit),profit>=0?"#90ee90":"#ff7070"],["Workers",data.workers.length,"#f5c87a"],["Pending",fmt(revenue-collected),"#ffd700"]].map(([l,v,c],i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:5}}><span style={{color:"#c08060"}}>{l}</span><span style={{color:c,fontWeight:"bold"}}>{v}</span></div>
                ))}

              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{background:"#170905",display:"flex",borderBottom:"2px solid #4d1a08",overflowX:"auto"}}>
        {TABS.map(t=><button key={t} style={nb(tab===t)} onClick={()=>{setTab(t);setShowPro(false);}}>{t}</button>)}
      </div>

      <div style={{padding:"20px 22px",maxWidth:1200,margin:"0 auto"}} onClick={()=>showPro&&setShowPro(false)}>
        {tab==="Dashboard"        &&<Dashboard/>}
        {tab==="Calendar"         &&<CalendarTab/>}
        {tab==="Raw Materials"    &&<Materials/>}
        {tab==="Production"       &&<Production/>}
        {tab==="Workers & Wages"  &&<Workers/>}
        {tab==="Sales"            &&<Sales/>}
        {tab==="Rejection Tracker"&&<RejectionTracker/>}
        {tab==="Profit Analysis"  &&<Profit/>}
        {tab==="Monthly Track"    &&<MonthlyTrack/>}
        {tab==="Yearly Track"     &&<YearlyTrack/>}
      </div>

      {confirmDel&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:2000}}>
          <div style={{background:"#1a0905",border:"2px solid #7a1515",borderRadius:12,padding:28,maxWidth:360,width:"90%",textAlign:"center"}}>
            <div style={{fontSize:36,marginBottom:10}}>⚠️</div>
            <div style={{fontSize:16,fontWeight:"bold",color:"#f5c87a",marginBottom:8}}>Confirm Delete</div>
            <div style={{fontSize:13,color:"#c08060",marginBottom:20}}>Delete <b style={{color:"#f5c87a"}}>{confirmDel.batchName}</b>?<br/>This will be permanently deleted from the database.</div>
            <div style={{display:"flex",gap:12,justifyContent:"center"}}>
              <button style={dBtn} onClick={()=>{if(confirmDel._t==="mat")delMat(confirmDel.id);else if(confirmDel._t==="sale")delSale(confirmDel.id);else if(confirmDel._t==="rej")delRej(confirmDel.id);else if(confirmDel._t==="worker")delWorker(confirmDel.id);else delBatch(confirmDel.id);}}>Yes, Delete</button>
              <button style={cBtn} onClick={()=>setConfirmDel(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {modal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}} onClick={e=>e.target===e.currentTarget&&closeM()}>
          <div style={C.mbox}>
            {modal==="worker"&&<><div style={C.mt}>👷 Worker — {form.id?"Edit":"Add"}</div><Field label="Full Name" name="name" value={form.name} onChange={sf}/><Field label="Role" name="role" value={form.role} onChange={sf}/><Field label="Daily Wage (Rs.)" name="dailyWage" type="number" value={form.dailyWage} onChange={sf}/><Field label="Days Worked This Month" name="daysWorked" type="number" value={form.daysWorked} onChange={sf}/><div style={{display:"flex",gap:10,marginTop:6}}><button style={C.btn} onClick={saveW} disabled={saving}>{saving?"Saving...":"Save"}</button><button style={cBtn} onClick={closeM}>Cancel</button></div></>}
            {modal==="sale"&&<><div style={C.mt}>💰 Sale — {form.id?"Edit":"Record"}</div><Field label="Date" name="date" type="date" value={form.date} onChange={sf}/><Field label="Buyer Name" name="buyer" value={form.buyer} onChange={sf}/><Field label="Quantity (bricks)" name="quantity" type="number" value={form.quantity} onChange={sf}/><Field label="Price per 1000 bricks (Rs.)" name="pricePerK" type="number" value={form.pricePerK} onChange={sf}/><SelF label="Payment Status" value={form.paid?"paid":"pending"} onChange={e=>sf("paid",e.target.value==="paid")}><option value="pending">Pending</option><option value="paid">Paid</option></SelF><div style={{display:"flex",gap:10}}><button style={C.btn} onClick={saveS} disabled={saving}>{saving?"Saving...":"Save"}</button><button style={cBtn} onClick={closeM}>Cancel</button></div></>}
            {modal==="material"&&<><div style={C.mt}>🪨 Raw Material — {form.id?"Edit":"Add"}</div><Field label="Material Name" name="name" value={form.name} onChange={sf}/><Field label="Unit (tons / kL / bags)" name="unit" value={form.unit} onChange={sf}/><Field label="Current Stock" name="stock" type="number" value={form.stock} onChange={sf}/><Field label="Cost per Unit (Rs.)" name="costPerUnit" type="number" value={form.costPerUnit} onChange={sf}/><Field label="Reorder Alert Level" name="reorderLevel" type="number" value={form.reorderLevel} onChange={sf}/><div style={{display:"flex",gap:10}}><button style={C.btn} onClick={saveMat} disabled={saving}>{saving?"Saving...":"Save"}</button><button style={cBtn} onClick={closeM}>Cancel</button></div></>}
            {modal==="batch"&&<><div style={C.mt}>🏭 Batch — {form.id?"Edit":"New"}</div><Field label="Batch Name" name="batchName" value={form.batchName} onChange={sf}/><Field label="Date" name="date" type="date" value={form.date} onChange={sf}/><Field label="Bricks Made" name="bricksMade" type="number" value={form.bricksMade} onChange={sf}/><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}><Field label="Clay (tons)" name="clayUsed" type="number" value={form.clayUsed} onChange={sf}/><Field label="Husk (bags)" name="sandUsed" type="number" value={form.sandUsed} onChange={sf}/><Field label="Coal (tons)" name="coalUsed" type="number" value={form.coalUsed} onChange={sf}/><Field label="Water (kL)" name="waterUsed" type="number" value={form.waterUsed} onChange={sf}/></div><SelF label="Status" value={form.status||"In Progress"} onChange={e=>sf("status",e.target.value)}><option>In Progress</option><option>Completed</option></SelF><div style={{display:"flex",gap:10}}><button style={C.btn} onClick={saveB} disabled={saving}>{saving?"Saving...":"Save"}</button><button style={cBtn} onClick={closeM}>Cancel</button></div></>}
            {modal==="overhead"&&<><div style={C.mt}>⚡ Overhead — {form.id?"Edit":"Add"}</div><Field label="Overhead Name" name="name" value={form.name} onChange={sf}/><Field label="Monthly Cost (Rs.)" name="monthlyCost" type="number" value={form.monthlyCost} onChange={sf}/><div style={{display:"flex",gap:10,marginTop:6}}><button style={C.btn} onClick={saveO} disabled={saving}>{saving?"Saving...":"Save"}</button><button style={cBtn} onClick={closeM}>Cancel</button></div></>}
            {modal==="rejection"&&<><div style={C.mt}>🚫 Rejection — {form.id?"Edit":"New"}</div><Field label="Date" name="date" type="date" value={form.date} onChange={sf}/><Field label="Batch Name" name="batchName" value={form.batchName} onChange={sf}/><Field label="Total Bricks Made" name="totalMade" type="number" value={form.totalMade} onChange={sf}/><Field label="Rejected Bricks" name="rejected" type="number" value={form.rejected} onChange={sf}/><Field label="Reason (Over-fired / Cracked / Improper mixing etc.)" name="reason" value={form.reason} onChange={sf}/><div style={{display:"flex",gap:10,marginTop:6}}><button style={C.btn} onClick={saveRej} disabled={saving}>{saving?"Saving...":"Save"}</button><button style={cBtn} onClick={closeM}>Cancel</button></div></>}
          </div>
        </div>
      )}
    </div>
  );
}
