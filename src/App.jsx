import { useState, useMemo, useEffect, useRef } from "react";

// ── Pricing constants ─────────────────────────────────────────────────────────
const NOISE_BASE_30={"<=140dB":3950,"145dB":4500,"150dB":5250,"155dB":5950,"160dB":7450,"165dB":8500,"170dB":12500};
const NOISE_BASE_60={"<=140dB":4925,"145dB":5750,"150dB":6875,"155dB":7925,"160dB":9175,"165dB":10750,"170dB":15750};

// Noise duration-based pricing
// ≤30 min → BASE_30, ≤60 min → BASE_60
// >1 hr: hours 2-20 = $500/hr; once total > 20 hrs, ALL overage = $375/hr
// Every 40 hrs resets with a new base
function noiseTestingPrice(durVal, durUnit, level, compCost){
  const base30 = NOISE_BASE_30[level]||0;
  const base60 = NOISE_BASE_60[level]||0;
  const compUp = (compCost||0)*1.25;
  const raw = parseFloat(durVal)||0;
  if(raw<=0) return Math.round(base30 + compUp);
  const totalHrs = durUnit==="hours"
    ? Math.ceil(raw)
    : raw<=30 ? null : Math.ceil(raw/60);
  if(totalHrs===null) return Math.round(base30 + compUp);
  if(totalHrs<=1)     return Math.round(base60 + compUp);
  // Multi-hour: every 40 hrs resets to a new base
  const BLOCK=40;
  const fullBlocks=Math.floor((totalHrs-1)/BLOCK);
  const remaining=totalHrs-(fullBlocks*BLOCK); // hours in current block (1..40)
  const blockAdder=(h)=>{
    if(h<=1)return 0;
    const extra=h-1; // hours beyond base hour
    if(h>20) return extra*375; // once block exceeds 20h, ALL extra hours at $375
    return extra*500; // hours 2-20 → $500/hr
  };
  return Math.round((base60*(fullBlocks+1))+blockAdder(remaining)+compUp);
}
const NOISE_FAC={"Speakerbox":1000,"64 Reverb Chamber":1500,"300 Reverb Chamber":2000,"Prog Wave Tube":2750};
// HFV testing price: $1225 flat ≤1hr, +$750/hr for hrs 1-3, +$525/hr for hrs 3+
function hfvTestingPrice(durMin){
  const m=parseFloat(durMin)||30;
  const hrs=m/60;
  if(hrs<=1) return 1225;
  if(hrs<=3) return Math.round((1225+750*(hrs-1))/25)*25;
  return Math.round((1225+750*2+525*(hrs-3))/25)*25;
}
const ENV_TH_PRICES={"0 to 1 Day":1000,"3 Days":1350,"5 Days":1875,"7 Days":2275,"10 Days":2950};
const PROC_BASE=1600, REPORT_BASE=950;
const EMI_SR=1600, PQ_SR=1450, DCM_SR=1600;
const PQ_ROWS=[
  {key:"5.3.1",label:"Voltage Variation",sh:1},
  {key:"5.3.2",label:"Voltage Modulation",sh:1},
  {key:"5.3.3",label:"Voltage Spike (300B)",sh:2},
  {key:"5.3.4",label:"Voltage Dropout",sh:1},
  {key:"5.3.5",label:"Voltage Spike (P1)",sh:2},
  {key:"5.3.6",label:"Frequency Variation",sh:1},
  {key:"5.3.7",label:"Current Waveform",sh:1},
  {key:"5.3.8",label:"DC Offset",sh:1},
  {key:"5.3.9",label:"Fault Clearing",sh:1},
];

const money = n => "$"+Math.round(n).toLocaleString();
const r25 = n => Math.round(n/25)*25;
const sf = (v,d=0) => { const n=parseFloat(v); return isNaN(n)?d:n; };
const mwDisc=vs=>{if(vs<=4000)return 1000;if(vs<=5000)return 1250;if(vs<=7000)return 1500;if(vs<=9000)return 1750;return 2000;};
const lwDisc=vs=>{if(vs<=2000)return 500;if(vs<=3000)return 750;return 1000;};
// MW testing price based on unit weight (lbs)
const mwTesting=wt=>{if(!wt||wt<=0)return 4575;if(wt<=2500)return 4575;if(wt<=3500)return 5575;return 6250;};

// ── Theme ─────────────────────────────────────────────────────────────────────
const C={
  bg:"#f0f2f5",panel:"#e8ecf0",card:"#ffffff",border:"#d0d7de",
  red:"#c0392b",redDim:"#e74c3c",muted:"#6b7a8d",dim:"#9aa5b1",
  text:"#1a2332",accent:"#1a5276",green:"#1e8449",warn:"#b7791f",
};
const inp={background:"#f8f9fa",border:"1px solid "+C.border,borderRadius:6,padding:"5px 8px",
  color:C.text,fontSize:12,outline:"none",fontFamily:"inherit",boxSizing:"border-box"};
const sel={...inp,cursor:"pointer"};
const card={background:C.card,border:"1px solid "+C.border,borderRadius:10,
  padding:12,marginBottom:10,boxShadow:"0 1px 3px rgba(0,0,0,0.07)"};

// ── Base components ───────────────────────────────────────────────────────────
function Toggle({checked,onChange,label,small}){
  return(
    <label style={{display:"flex",alignItems:"center",gap:7,cursor:"pointer",userSelect:"none"}}>
      <div onClick={()=>onChange(!checked)} style={{width:small?30:34,height:small?17:19,borderRadius:10,
        background:checked?C.red:C.dim,position:"relative",transition:"background .15s",flexShrink:0}}>
        <div style={{position:"absolute",top:2,left:checked?(small?15:17):2,
          width:small?13:15,height:small?13:15,borderRadius:"50%",background:"#fff",transition:"left .15s"}}/>
      </div>
      {label&&<span style={{fontSize:small?11:12,color:C.muted}}>{label}</span>}
    </label>
  );
}

function Inp({value,onChange,width=90,right,placeholder}){
  return <input value={value} onChange={e=>onChange(e.target.value)}
    placeholder={placeholder||""}
    style={{...inp,width,textAlign:right?"right":"left"}}/>;
}
function Sel({value,onChange,options,width=160}){
  return <select value={value} onChange={e=>onChange(e.target.value)} style={{...sel,width}}>
    {options.map(o=><option key={o.value||o} value={o.value||o}>{o.label||o}</option>)}
  </select>;
}
function Row({label,children,mb=8}){
  return <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:mb}}>
    <span style={{fontSize:11,color:C.muted,minWidth:120}}>{label}</span>{children}
  </div>;
}
function PRow({label,val,onChange}){
  return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
      <span style={{fontSize:11,color:C.muted,flex:1}}>{label}</span>
      <div style={{display:"flex",alignItems:"center",gap:3}}>
        <span style={{fontSize:11,color:C.muted}}>$</span>
        <Inp value={val} onChange={onChange} width={80} right/>
      </div>
    </div>
  );
}
const HR=()=><div style={{height:1,background:C.border,margin:"10px 0"}}/>;

function Pia({s,set}){
  const levels=[{p:"PIA 1",m:1.10},{p:"PIA 2",m:1.15},{p:"PIA 3",m:1.20}];
  const cur=s.pia||0;
  return(
    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
      <span style={{fontSize:11,color:C.muted,minWidth:30}}>PIA:</span>
      {levels.map((l,i)=>(
        <label key={i} style={{display:"flex",alignItems:"center",gap:4,cursor:"pointer"}}>
          <input type="checkbox" checked={cur===l.m}
            onChange={()=>set(prev=>({...prev,pia:prev.pia===l.m?0:l.m}))}
            style={{accentColor:C.red,width:13,height:13}}/>
          <span style={{fontSize:11,color:cur===l.m?C.redDim:C.muted}}>{l.p}</span>
        </label>
      ))}
      {cur>0&&<span style={{fontSize:10,color:C.redDim,marginLeft:4}}>
        +{Math.round((cur-1)*100)}%
      </span>}
    </div>
  );
}

function ProcReport({s,set,procPrice,reportPrice,sectionCode}){
  const pp=procPrice||PROC_BASE;
  const rp=reportPrice||REPORT_BASE;
  return(
    <div style={{marginTop:8}}>
      <div style={{display:"flex",gap:16,flexWrap:"wrap",marginBottom:8}}>
        <Toggle small checked={s.proc||false} onChange={v=>set({...s,proc:v})}
          label={"Procedure $"+pp.toLocaleString()}/>
        <Toggle small checked={s.report||false} onChange={v=>set({...s,report:v})}
          label={"Report $"+rp.toLocaleString()}/>
      </div>
      <SectionCustom s={s} set={set} sectionCode={sectionCode}/>
    </div>
  );
}

function SectionCustom({s,set,sectionCode}){
  const rows=s.customRows||[];
  const add=()=>set({...s,customRows:[...rows,{label:"",price:"0",code:sectionCode||""}]});
  const rem=i=>set({...s,customRows:rows.filter((_,j)=>j!==i)});
  const upd=(i,k,v)=>set({...s,customRows:rows.map((r,j)=>j===i?{...r,[k]:v}:r)});
  return(
    <div>
      {rows.map((r,i)=>(
        <div key={i} style={{display:"flex",gap:5,alignItems:"center",marginBottom:4}}>
          <Inp value={r.label} onChange={v=>upd(i,"label",v)} width={160} placeholder="Custom line item"/>
          <span style={{fontSize:11,color:C.muted}}>$</span>
          <Inp value={r.price} onChange={v=>upd(i,"price",v)} width={70} right/>
          <button onClick={()=>rem(i)} style={{background:"none",border:"none",color:C.dim,cursor:"pointer",fontSize:13}}>✕</button>
        </div>
      ))}
      <button onClick={add} style={{background:"none",border:"none",color:C.accent,cursor:"pointer",fontSize:11,padding:0,marginTop:2}}>
        + Add custom line
      </button>
    </div>
  );
}

// ── Section wrapper with expand-on-enable ─────────────────────────────────────
function Section({title,enabled,onToggle,tag,children}){
  const [open,setOpen]=useState(false);
  useEffect(()=>{if(enabled)setOpen(true);},[enabled]);
  const handleToggle=v=>{onToggle(v);if(v)setOpen(true);};
  return(
    <div style={{...card,padding:0,overflow:"hidden",
      border:"1px solid "+(enabled?C.red+"66":C.border),
      boxShadow:enabled?"0 1px 4px rgba(192,57,43,0.12)":"0 1px 3px rgba(0,0,0,0.06)"}}>
      <div style={{display:"flex",alignItems:"center",gap:9,padding:"10px 14px",
        background:enabled?"#fdf3f2":C.card,cursor:"pointer",
        borderBottom:enabled&&open?"1px solid "+C.border:"none"}}
        onClick={()=>{if(enabled)setOpen(o=>!o);}}>
        <div onClick={e=>{e.stopPropagation();handleToggle(!enabled);}}>
          <Toggle checked={enabled} onChange={handleToggle}/>
        </div>
        <span style={{fontWeight:600,fontSize:12,color:enabled?C.red:C.muted,flex:1,letterSpacing:.3}}>{title}</span>
        {tag&&<span style={{fontSize:10,background:C.red+"18",color:C.red,borderRadius:4,padding:"2px 6px",fontWeight:600}}>{tag}</span>}
        {enabled&&<span style={{color:C.dim,fontSize:11}}>{open?"▲":"▼"}</span>}
      </div>
      {enabled&&open&&<div style={{padding:"12px 14px 14px",background:"#fff"}}>{children}</div>}
      {enabled&&!open&&(
        <div style={{padding:"3px 14px 7px",cursor:"pointer",background:"#fdf3f2"}}
          onClick={()=>setOpen(true)}>
          <span style={{fontSize:10,color:C.redDim}}>click to expand ▼</span>
        </div>
      )}
    </div>
  );
}

// Identifier input that buffers locally — avoids losing focus on parent re-render
function IdentifierInput({value,onCommit,style}){
  const [local,setLocal]=React.useState(value||"");
  const lastCommit=React.useRef(value||"");
  React.useEffect(()=>{
    if(value!==lastCommit.current){
      lastCommit.current=value||"";
      setLocal(value||"");
    }
  },[value]);
  return <input value={local}
    onChange={e=>setLocal(e.target.value)}
    onBlur={e=>{lastCommit.current=e.target.value;onCommit(e.target.value);}}
    placeholder="Identifier (e.g. S/N, Unit #)"
    style={style}/>;
}

function TestInstance({inst,idx,total,Form,formProps,onUpdate,onRemove,newInstance}){
  const [localId,setLocalId]=useState(inst.identifier||"");
  useEffect(()=>setLocalId(inst.identifier||""),[inst.id]);
  const commitId=()=>onUpdate(idx,prev=>({...prev,identifier:localId}));
  const handleIdChange=(e)=>{
    setLocalId(e.target.value);
    onUpdate(idx,prev=>({...prev,identifier:e.target.value}));
  };
  return(
    <div data-testinstance={idx} style={{
      border:idx>0?"1px solid "+C.border:"none",
      borderRadius:idx>0?8:0,padding:idx>0?10:0,marginBottom:idx>0?10:0,
      background:idx>0?C.panel:"transparent"}}>
      {idx>0&&(
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
          <Toggle small checked={inst.on} onChange={v=>{
              if(!v){const fresh=newInstance?newInstance():{};onUpdate(idx,{...fresh,id:inst.id,on:false});}
              else onUpdate(idx,{...inst,on:v});
            }}
            label={"Test #"+(idx+1)}/>
          <input value={localId} onChange={handleIdChange} onBlur={commitId}
            placeholder="Identifier (e.g. S/N, Unit #)"
            style={{...inp,flex:1,fontSize:11}}/>
          <button onClick={()=>onRemove(idx)}
            style={{background:"none",border:"none",color:C.redDim,cursor:"pointer",fontSize:12,padding:"0 6px",fontWeight:600}}>
            Remove
          </button>
        </div>
      )}
      {idx===0&&total>1&&(
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
          <span style={{fontSize:11,color:C.muted,fontWeight:600}}>Test #1</span>
          <input value={localId} onChange={handleIdChange} onBlur={commitId}
            placeholder="Identifier (e.g. S/N, Unit #)"
            style={{...inp,flex:1,fontSize:11}}/>
        </div>
      )}
      <Form s={inst} set={s=>onUpdate(idx,s)} {...formProps}/>
    </div>
  );
}

function MultiSection({title,instances,onAdd,onRemove,onUpdate,tag,newInstance,Form,formProps}){
  const anyOn=instances.some(i=>i.on);
  const [open,setOpen]=useState(false);
  // Auto-expand when any instance turns on
  useEffect(()=>{if(anyOn)setOpen(true);},[anyOn]);
  const handleToggle=v=>{
    if(v&&instances.length===0){onAdd();setOpen(true);}
    else if(v){onUpdate(0,{...instances[0],on:true});setOpen(true);}
    else if(!v&&instances.length>0){
      // Unchecking: reset ALL instances to fresh defaults, keep only first one
      const fresh={...newInstance(),id:instances[0].id,on:false};
      onUpdate(0,fresh);
      // Remove any additional instances
      for(let i=instances.length-1;i>0;i--)onRemove(i);
    }
  };
  return(
    <div style={{...card,padding:0,overflow:"hidden",
      border:"1px solid "+(anyOn?C.red+"66":C.border),
      boxShadow:anyOn?"0 1px 4px rgba(192,57,43,0.12)":"0 1px 3px rgba(0,0,0,0.06)"}}>
      <div style={{display:"flex",alignItems:"center",gap:9,padding:"10px 14px",
        background:anyOn?"#fdf3f2":C.card,cursor:"pointer",
        borderBottom:anyOn&&open?"1px solid "+C.border:"none"}}
        onClick={()=>{if(anyOn)setOpen(o=>!o);}}>
        <div onClick={e=>{e.stopPropagation();handleToggle(!anyOn);}}>
          <Toggle checked={anyOn} onChange={()=>{}}/>
        </div>
        <span style={{fontWeight:600,fontSize:12,color:anyOn?C.red:C.muted,flex:1,letterSpacing:.3}}>{title}</span>
        {instances.length>1&&<span style={{fontSize:10,background:C.accent+"22",color:C.accent,borderRadius:4,padding:"2px 6px",fontWeight:600}}>{instances.length}x</span>}
        {tag&&<span style={{fontSize:10,background:C.red+"18",color:C.red,borderRadius:4,padding:"2px 6px",fontWeight:600}}>{tag}</span>}
        {anyOn&&<span style={{color:C.dim,fontSize:11}}>{open?"▲":"▼"}</span>}
      </div>
      {anyOn&&open&&(
        <div style={{padding:"12px 14px 14px",background:"#fff"}}>
          {instances.map((inst,idx)=>(
            <TestInstance key={"ti-"+inst.id}
              inst={inst} idx={idx} total={instances.length}
              Form={Form} formProps={formProps}
              onUpdate={onUpdate} onRemove={onRemove} newInstance={newInstance}/>
          ))}
          <button onClick={()=>{onAdd();setTimeout(()=>{
              const els=document.querySelectorAll('[data-testinstance]');
              if(els.length)els[els.length-1].scrollIntoView({behavior:'smooth',block:'center'});
            },100);}}
            style={{width:"100%",marginTop:8,background:"none",border:"1px dashed "+C.border,
              borderRadius:7,color:C.accent,padding:"7px 0",cursor:"pointer",fontSize:11,fontWeight:600}}>
            + Add Additional Test
          </button>
        </div>
      )}
      {anyOn&&!open&&(
        <div style={{padding:"3px 14px 7px",cursor:"pointer",background:"#fdf3f2"}}
          onClick={()=>setOpen(true)}>
          <span style={{fontSize:10,color:C.redDim}}>
            {instances.length>1?instances.length+"x tests — ":""}click to expand ▼
          </span>
        </div>
      )}
    </div>
  );
}

// ── Form components ───────────────────────────────────────────────────────────
function VibForm({s,set,setup}){
  const pm=s.pia||1;
  const std=sf(s.stdSetup||s.setup||900);
  const dr=Math.round(sf(setup.holes)*0.5*sf(setup.techRate,175)*(setup.drillTap?1.5:1));
  const fab=Math.round(sf(setup.fabHours)*sf(setup.techRate,175));
  const addl=sf(s.addlCosts,0);
  const setupTotal=std+dr+fab+addl;
  return <div>
    <div style={{fontSize:10,color:C.muted,marginBottom:6,fontWeight:600}}>MIL-STD-167</div>
    <Row label="Spec"><Inp value={s.spec||""} onChange={v=>set({...s,spec:v})} width={200}/></Row>
    <Row label="Freq Range"><Inp value={s.freqRange||""} onChange={v=>set({...s,freqRange:v})} width={120}/>
      <span style={{fontSize:11,color:C.muted}}>Hz</span>
    </Row>
    <Pia s={s} set={set}/>
    <Toggle small checked={s.circ||false} onChange={v=>set({...s,circ:v})} label="Circulating System (+$2,500)"/>
    <div style={{display:"flex",gap:16,marginTop:6,flexWrap:"wrap"}}>
      <Toggle small checked={s.hydroPre||false} onChange={v=>set({...s,hydroPre:v})} label="Pre-Test Hydrostatic"/>
      <Toggle small checked={s.hydroPost||false} onChange={v=>set({...s,hydroPost:v})} label="Post-Test Hydrostatic"/>
    </div>
    <HR/>
    <PRow label="Std Setup" val={s.stdSetup||s.setup||"900"} onChange={v=>set({...s,stdSetup:v})}/>
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
      <input type="checkbox" checked={s.showSetup!==false}
        onChange={e=>set({...s,showSetup:e.target.checked})}
        style={{cursor:"pointer"}}/>
      <label style={{fontSize:11,color:C.dim,cursor:"pointer"}}>Include Setup Line</label>
    </div>
    <PRow label="Add'l Costs" val={s.addlCosts||"0"} onChange={v=>set({...s,addlCosts:v})}/>
    <PRow label={"Testing"+(pm>1?" (x"+pm+")":"")} val={s.testing} onChange={v=>set({...s,testing:v})}/>
    {(s.hydroPre||s.hydroPost)&&<PRow label="Hydrostatic" val={s.hydroPrice||"500"} onChange={v=>set({...s,hydroPrice:v})}/>}
    <div style={{fontSize:10,background:C.panel,borderRadius:5,padding:"5px 8px",marginBottom:6}}>
      <span style={{color:C.dim}}>Setup: </span>
      <span style={{color:C.text,fontWeight:600}}>{money(setupTotal)}</span>
      <span style={{color:C.dim,fontSize:9}}>{" = "}{"$"+sf(s.stdSetup||s.setup||900).toLocaleString()}{dr>0?" + $"+dr.toLocaleString()+" drill":""}{fab>0?" + $"+fab.toLocaleString()+" fab":""}{addl>0?" + $"+addl.toLocaleString()+" addl":""}{pm>1?" x "+pm+" PIA":""}</span>
    </div>
    <div style={{borderTop:"1px solid "+C.border,paddingTop:8,marginTop:6}}>
      <Toggle small checked={(s.fixtureFab||{}).on||false}
        onChange={v=>set({...s,fixtureFab:{...(s.fixtureFab||{hours:"0",techRate:"175"}),on:v}})}
        label="Fixture Fabrication"/>
      {(s.fixtureFab||{}).on&&(
        <div style={{background:C.panel,borderRadius:6,padding:"8px 10px",marginTop:6}}>
          <div style={{fontSize:9,color:C.dim,fontWeight:700,letterSpacing:.5,marginBottom:6}}>FIXTURE FAB LABOR</div>
          <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
            <div>
              <div style={{fontSize:9,color:C.dim,marginBottom:2}}>Hours</div>
              <Inp value={(s.fixtureFab||{}).hours||"0"} onChange={v=>set({...s,fixtureFab:{...(s.fixtureFab||{}),hours:v}})} width={60} right/>
            </div>
            <div>
              <div style={{fontSize:9,color:C.dim,marginBottom:2}}>Tech Rate</div>
              <Inp value={(s.fixtureFab||{}).techRate||"175"} onChange={v=>set({...s,fixtureFab:{...(s.fixtureFab||{}),techRate:v}})} width={65} right/>
            </div>
            <div style={{fontSize:10,color:C.muted,marginTop:12}}>
              {"= $"+Math.round(sf((s.fixtureFab||{}).hours,0)*sf((s.fixtureFab||{}).techRate,175)).toLocaleString()+" labor"}
            </div>
          </div>
          <div style={{fontSize:9,color:C.dim,marginTop:6}}>Add budget materials and set "Roll Into" to "Fixture Fabrication – Vibration" to include them in this line.</div>
        </div>
      )}
    </div>
    <ProcReport s={s} set={set} sectionCode="94"/>
  </div>;
}

function ShockForm({s,set,vibSetup,setup,ti}){
  const disc=s.cat==="Medium Weight"?mwDisc(vibSetup):lwDisc(vibSetup);
  const pm=s.pia||1;
  const dr=Math.round(sf(setup.holes)*0.5*sf(setup.techRate,175)*(setup.drillTap?1.5:1));
  const fab=Math.round(sf(setup.fabHours)*sf(setup.techRate,175));
  const std=s.fromVib&&vibSetup>0?disc:sf(s.stdSetup||s.setup||1500);
  const addl=sf(s.addlCosts,0);
  const setupTotal=s.fromVib&&vibSetup>0?disc:std+dr+fab+addl;
  return <div>
    <Row label="Spec"><Inp value={s.spec||""} onChange={v=>set({...s,spec:v})} width={200}/></Row>
    <Row label="Category">
      <Sel value={s.cat} onChange={v=>set({...s,cat:v,testing:v==="Medium Weight"?"4575":"1450",stdSetup:v==="Medium Weight"?"1500":"900"})}
        options={["Medium Weight","Lightweight"]} width={160}/>
    </Row>
    <Row label="Grade"><Inp value={s.grade||""} onChange={v=>set({...s,grade:v})} width={60}/></Row>
    <Row label="Class"><Inp value={s.class_||""} onChange={v=>set({...s,class_:v})} width={60}/></Row>
    <Row label="Type"><Inp value={s.type_||""} onChange={v=>set({...s,type_:v})} width={60}/></Row>
    <Row label="Location">
      <Sel value={s.location||"Hull"} onChange={v=>set({...s,location:v})}
        options={["Hull","Deck","Hull/Deck","Conventional Deck","Mitigated Deck","Isolated Deck","Shell","Wetted-Surface","Frame"]} width={220}/>
    </Row>
    <div style={{marginBottom:8,marginTop:-4}}>
      <Toggle small checked={s.submarine||false} onChange={v=>set({...s,submarine:v})} label="Submarine"/>
    </div>
    <Row label="Orientation">
      <Sel value={s.orientation||"Unrestricted"} onChange={v=>set({...s,orientation:v})}
        options={["Unrestricted","Vertical Axis Specified","Restricted","Custom","Unknown"]} width={180}/>
    </Row>
    <Row label="# Blows">
      <Inp value={s.blows||""} onChange={v=>set({...s,blows:v})} width={60}/>
      <span style={{fontSize:10,color:C.dim,marginLeft:6}}>leave blank if standard</span>
    </Row>
    {s.cat==="Medium Weight"&&(
      <Row label="Unit Weight (lbs)">
        <Inp value={s.weight||(ti?.wt||"")} onChange={v=>set({...s,weight:v,testing:v&&sf(v)>0?String(mwTesting(sf(v))):s.testing})} width={80}/>
        <span style={{fontSize:10,color:C.dim,marginLeft:6}}>{ti?.wt&&!s.weight?"from unit details":"auto-sets testing price"}</span>
      </Row>
    )}
    <Pia s={s} set={set}/>
    <Toggle small checked={s.fromVib||false} onChange={v=>set({...s,fromVib:v})} label="Moving from Vib (discounted setup)"/>
    <Toggle small checked={s.circ||false} onChange={v=>set({...s,circ:v})} label="Circulating System"/>
    <div style={{display:"flex",gap:16,marginTop:6,flexWrap:"wrap"}}>
      <Toggle small checked={s.hydroPre||false} onChange={v=>set({...s,hydroPre:v})} label="Pre-Test Hydrostatic"/>
      <Toggle small checked={s.hydroPost||false} onChange={v=>set({...s,hydroPost:v})} label="Post-Test Hydrostatic"/>
    </div>
    <HR/>
    {!(s.fromVib&&vibSetup>0)&&<PRow label="Std Setup" val={s.stdSetup||s.setup||"1500"} onChange={v=>set({...s,stdSetup:v})}/>}
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
      <input type="checkbox" checked={s.showSetup!==false}
        onChange={e=>set({...s,showSetup:e.target.checked})}
        style={{cursor:"pointer"}}/>
      <label style={{fontSize:11,color:C.dim,cursor:"pointer"}}>Include Setup Line</label>
    </div>
    {!(s.fromVib&&vibSetup>0)&&<PRow label="Add'l Costs" val={s.addlCosts||"0"} onChange={v=>set({...s,addlCosts:v})}/>}
    <PRow label={"Testing"+(pm>1?" (x"+pm+")":"")+(s.cat==="Medium Weight"?" (auto: $"+mwTesting(sf(s.weight||ti?.wt||0)).toLocaleString()+")":"")} val={s.testing} onChange={v=>set({...s,testing:v})}/>
    {s.cat==="Medium Weight"&&<div style={{fontSize:10,color:C.dim,marginBottom:4}}>Weight-based: ≤2,500lb $4,575 · 2,501–3,500lb $5,575 · &gt;3,500lb $6,250<br/>Set weight in Unit Details above to auto-suggest.</div>}
    {(s.hydroPre||s.hydroPost)&&<PRow label="Hydrostatic (each)" val={s.hydroPrice||"500"} onChange={v=>set({...s,hydroPrice:v})}/>}
    <div style={{fontSize:10,background:C.panel,borderRadius:5,padding:"5px 8px",marginBottom:6}}>
      <span style={{color:C.dim}}>Setup: </span>
      <span style={{color:C.text,fontWeight:600}}>{money(setupTotal)}</span>
      {s.fromVib&&vibSetup>0
        ? <span style={{color:C.dim,fontSize:9}}>{" (discounted from vib setup $"+vibSetup.toLocaleString()+")"}</span>
        : <span style={{color:C.dim,fontSize:9}}>{" = $"+sf(s.stdSetup||s.setup||1500).toLocaleString()+(dr>0?" + $"+dr.toLocaleString()+" drill":"")+(fab>0?" + $"+fab.toLocaleString()+" fab":"")+(addl>0?" + $"+addl.toLocaleString()+" addl":"")+(pm>1?" x "+pm+" PIA":"")}</span>
      }
    </div>
    <div style={{borderTop:"1px solid "+C.border,paddingTop:8,marginTop:6}}>
      <Toggle small checked={(s.fixtureFab||{}).on||false}
        onChange={v=>set({...s,fixtureFab:{...(s.fixtureFab||{hours:"0",techRate:"175"}),on:v}})}
        label="Fixture Fabrication"/>
      {(s.fixtureFab||{}).on&&(
        <div style={{background:C.panel,borderRadius:6,padding:"8px 10px",marginTop:6}}>
          <div style={{fontSize:9,color:C.dim,fontWeight:700,letterSpacing:.5,marginBottom:6}}>FIXTURE FAB LABOR</div>
          <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
            <div>
              <div style={{fontSize:9,color:C.dim,marginBottom:2}}>Hours</div>
              <Inp value={(s.fixtureFab||{}).hours||"0"} onChange={v=>set({...s,fixtureFab:{...(s.fixtureFab||{}),hours:v}})} width={60} right/>
            </div>
            <div>
              <div style={{fontSize:9,color:C.dim,marginBottom:2}}>Tech Rate</div>
              <Inp value={(s.fixtureFab||{}).techRate||"175"} onChange={v=>set({...s,fixtureFab:{...(s.fixtureFab||{}),techRate:v}})} width={65} right/>
            </div>
            <div style={{fontSize:10,color:C.muted,marginTop:12}}>
              {"= $"+Math.round(sf((s.fixtureFab||{}).hours,0)*sf((s.fixtureFab||{}).techRate,175)).toLocaleString()+" labor"}
            </div>
          </div>
          <div style={{fontSize:9,color:C.dim,marginTop:6}}>Add budget materials and set "Roll Into" to "Fixture Fabrication – Shock" to include them in this line.</div>
        </div>
      )}
    </div>
    <ProcReport s={s} set={set} sectionCode={s.cat==="Medium Weight"?"91":"92"}/>
  </div>;
}

function NoiseForm({s,set,setup,ti}){
  const COMP_COST={"<=140dB":0,"145dB":750,"150dB":1500,"155dB":1500,"160dB":1500,"165dB":2000,"170dB":3500};
  const autoComp=COMP_COST[s.level]||0;
  const compNeedsSync=autoComp>0&&(s.compBudget==="0"||s.compBudget===undefined||s.compBudget==="");
  const compCost=compNeedsSync?autoComp:sf(s.compBudget,autoComp);
  // Auto testing price uses duration-based pricing
  const autoTesting=noiseTestingPrice(s.durVal,s.durUnit,s.level,compCost);
  // Setup price = chamber standard setup
  const chamberSetup=NOISE_FAC[s.chamber]||1000;
  const pm=s.pia||1;
  // Chamber recommendation based on unit dims AND dB level
  const L=sf(ti?.dimL,0), W=sf(ti?.dimW,0), H=sf(ti?.dimH,0);
  const cuIn=L*W*H;
  const cuFt=cuIn/1728;
  const dbNum=s.level==="<=140dB"?140:parseInt(s.level)||0;

  // Determine recommended chamber per spec:
  // Speakerbox:        ≤500 in³ AND ≤145 dB
  // 64 Reverb:         ≤6.4 ft³ (no dB cap)
  // 300 Reverb:        ≤30 ft³  AND ≤165 dB
  // Prog Wave Tube:    H≤40" AND W≤40" AND ≤165 dB
  // (>165 dB in any chamber: disclaimer about custom build)
  const fitsSpkr  = cuIn>0 && cuIn<=500  && dbNum<=145;
  const fits64    = cuIn>0 && cuFt<=6.4;
  const fits300   = cuIn>0 && cuFt<=30   && dbNum<=165;
  const fitsPWT   = cuIn>0 && H<=40 && W<=40 && dbNum<=165;
  const over165   = dbNum>165;

  const chamberRec = cuIn>0 ? (
    fitsSpkr  ? "Speakerbox" :
    fits64    ? "64 Reverb Chamber" :
    fits300   ? "300 Reverb Chamber" :
    fitsPWT   ? "Prog Wave Tube" :
    over165   ? "Prog Wave Tube" : // show with disclaimer
    "Prog Wave Tube"
  ) : "";

  // Is the currently selected chamber valid for this unit?
  const chamberOk = !cuIn || (
    s.chamber==="Speakerbox"         ? fitsSpkr  :
    s.chamber==="64 Reverb Chamber"  ? fits64    :
    s.chamber==="300 Reverb Chamber" ? fits300   :
    s.chamber==="Prog Wave Tube"     ? fitsPWT   :
    false
  );

  // Disclaimer for >165dB
  const highDbDisclaimer = over165
    ? "⚠ Levels above 165dB: NU Labs can build a new chamber to accommodate depending on size — contact us to discuss."
    : null;
  return <div>
    <Row label="Spec"><Inp value={s.spec||""} onChange={v=>set({...s,spec:v})} width={200}/></Row>
    <Row label="OASPL (pricing)">
      <Sel value={s.level} onChange={v=>{const nc=COMP_COST[v]||0;set({...s,level:v,compBudget:String(nc),testing:String(noiseTestingPrice(s.durVal,s.durUnit,v,nc))});}}
        options={["<=140dB","145dB","150dB","155dB","160dB","165dB","170dB"]} width={110}/>
    </Row>
    <Row label="OASPL (spec)"><Inp value={s.oaspl||""} onChange={v=>set({...s,oaspl:v})} width={90}/></Row>
    <Row label="Chamber">
      <Sel value={s.chamber} onChange={v=>set({...s,chamber:v,stdSetup:String(NOISE_FAC[v]||1000)})}
        options={["Speakerbox","64 Reverb Chamber","300 Reverb Chamber","Prog Wave Tube"]} width={200}/>
    </Row>
    {cuIn>0&&(
      <div style={{fontSize:10,borderRadius:5,padding:"4px 8px",marginBottom:6,
        background:chamberOk?"#f0fdf4":"#fdf3f2",color:chamberOk?"#15803d":C.red}}>
        {(()=>{
          // Check dB range for selected chamber
          const dbOk=
            s.chamber==="Speakerbox"?dbNum<=145:
            s.chamber==="64 Reverb Chamber"?true:
            s.chamber==="300 Reverb Chamber"?dbNum<=165:
            s.chamber==="Prog Wave Tube"?dbNum<=165:true;
          // Check size — 10% of chamber volume allowance
          // Chamber volumes: Speakerbox ~500 in³, 64 Reverb ~6.4 ft³=11059 in³, 300 Reverb ~30 ft³=51840 in³, PWT: H≤40" W≤40"
          const chamberVol={"Speakerbox":500,"64 Reverb Chamber":6.4*1728,"300 Reverb Chamber":30*1728,"Prog Wave Tube":null};
          const vol=chamberVol[s.chamber];
          const sizeOk=s.chamber==="Prog Wave Tube"?(H<=40&&W<=40):(vol?cuIn<=vol:true);
          const at10=vol?cuIn>vol*0.9:false; // within 10% of limit
          return(<>
            {!dbOk&&<div style={{color:C.red,fontWeight:600}}>⚠ OASPL is not within standard range of this chamber — check with production.</div>}
            {!sizeOk&&<div style={{color:C.red,fontWeight:600}}>⚠ This unit exceeds the chamber volume allowance — check with production.</div>}
            {sizeOk&&at10&&<div style={{color:C.warn,fontWeight:600}}>⚠ Unit is within 10% of chamber volume limit — check with production.</div>}
            {dbOk&&sizeOk&&!at10&&<div style={{color:"#15803d"}}>✓ {s.chamber} is suitable for this unit ({cuIn.toFixed(0)} in³ / {cuFt.toFixed(2)} ft³)</div>}
            {!chamberOk&&chamberRec&&<button onClick={()=>set({...s,chamber:chamberRec})}
              style={{marginTop:4,fontSize:9,background:"none",border:"1px solid "+C.red,borderRadius:4,
                color:C.red,cursor:"pointer",padding:"1px 5px",display:"block"}}>Switch to recommended: {chamberRec}</button>}
            {highDbDisclaimer&&<div style={{marginTop:4,color:C.warn,fontWeight:600}}>{highDbDisclaimer}</div>}
          </>);
        })()}
      </div>
    )}

    <Row label="Duration">
      <Inp value={s.durVal} onChange={v=>set({...s,durVal:v,testing:String(noiseTestingPrice(v,s.durUnit,s.level,compCost))})} width={55}/>
      <Sel value={s.durUnit} onChange={v=>set({...s,durUnit:v,testing:String(noiseTestingPrice(s.durVal,v,s.level,compCost))})} options={["minutes","hours"]} width={85}/>
    </Row>
    <Row label="Compressor ($)">
      <Inp value={s.compBudget!==undefined&&s.compBudget!==""?s.compBudget:String(autoComp)} onChange={v=>set({...s,compBudget:v})} width={80}/>
      <span style={{fontSize:10,color:autoComp>0?C.warn:C.dim,marginLeft:4}}>
        {autoComp>0?"auto: $"+autoComp.toLocaleString()+" → $"+Math.round(autoComp*1.25).toLocaleString()+" w/markup":"25% markup applied"}
      </span>
    </Row>
    {sf(s.compBudget,0)>0&&(
      <div style={{fontSize:10,background:"#f0fdf4",border:"1px solid #86efac",borderRadius:5,
        padding:"5px 8px",marginBottom:6,color:"#166534"}}>
        ✓ Compressor rental (${sf(s.compBudget,0).toLocaleString()}) auto-added to Budget Materials as "Noise – Testing".
      </div>
    )}
    <Pia s={s} set={set}/>
    <HR/>
    <PRow label={"Std Setup (auto: "+money(chamberSetup)+")"} val={s.stdSetup||String(chamberSetup)} onChange={v=>set({...s,stdSetup:v})}/>
    <PRow label="Add'l Costs" val={s.addlCosts||"0"} onChange={v=>set({...s,addlCosts:v})}/>
    <PRow label={"Testing (auto: "+money(autoTesting)+")"} val={s.testing} onChange={v=>set({...s,testing:v})}/>
    {(()=>{
      const hrs=s.durUnit==="hours"?Math.ceil(parseFloat(s.durVal)||1):Math.ceil((parseFloat(s.durVal)||30)/60);
      if(hrs<=1)return null;
      const base60=NOISE_BASE_60[s.level]||0;
      const fullBlocks=Math.floor((hrs-1)/40);
      const remaining=hrs-(fullBlocks*40);
      const extraHrs=remaining-1;
      const blockCost=remaining>20?extraHrs*375:extraHrs*500;
      const rateNote=remaining>20?"all $375/hr":"$500/hr";
      return(
        <div style={{fontSize:10,color:"#6b7a8d",marginBottom:6,padding:"4px 8px",
          background:"#f8f9fb",borderRadius:5}}>
          {fullBlocks>0&&<span>{fullBlocks+1}× base ${base60.toLocaleString()} · </span>}
          {extraHrs>0&&<span>hrs 2–{remaining} ({rateNote}): ${blockCost.toLocaleString()} · </span>}
          <strong>Total: {money(autoTesting)}</strong>
        </div>
      );
    })()}
    {s.level==="170dB"&&(
      <div style={{fontSize:11,color:C.warn,marginBottom:6}}>⚠ 170dB performed as best effort</div>
    )}
    <ProcReport s={s} set={set} sectionCode="11"/>
  </div>;
}

function EnvForm({s,set}){
  const ENV_ITEMS=[
    {key:"th",label:"Temperature & Humidity",setup:500,testing:1000,td:500},
    {key:"sf",label:"Salt Fog (96 hrs)",setup:0,testing:1750,td:500},
    {key:"alt",label:"Altitude",setup:500,testing:1000,td:500},
    {key:"ess",label:"ESS",setup:0,testing:1000,td:500},
    {key:"acc",label:"Acceleration",setup:2000,testing:1950,td:750},
    {key:"incl",label:"Inclination",setup:1250,testing:1750,td:500},
    {key:"rd",label:"Rapid Decompression",setup:1000,testing:2275,td:500},
    {key:"ed",label:"Explosive Decompression",setup:1250,testing:2450,td:500},
    {key:"drip",label:"Drip Test",setup:500,testing:750,td:300},
    {key:"sub",label:"Submergence",setup:500,testing:750,td:300},
    {key:"spray",label:"Spray Test",setup:1250,testing:1250,td:500},
    {key:"insres",label:"Insulation Resistance & Dielectric Strength",setup:0,testing:500,td:0},
  ];
  return <div>
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
      <input type="checkbox" checked={s.showSetup!==false}
        onChange={e=>set({...s,showSetup:e.target.checked})}
        style={{cursor:"pointer"}}/>
      <label style={{fontSize:11,color:C.dim,cursor:"pointer"}}>Include Setup Lines</label>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:8}}>
      {ENV_ITEMS.map(({key,label,setup,testing,td})=>{
        const checked=s.items?.[key]?.on||false;
        return(
          <div key={key} style={{background:checked?"#fdf3f2":C.panel,
            border:"1px solid "+(checked?C.red+"44":C.border),borderRadius:7,padding:"7px 10px"}}>
            <Toggle small checked={checked}
              onChange={v=>set({...s,items:{...s.items,[key]:{...(s.items?.[key]||{}),on:v,setup:String(setup),testing:String(testing),td:String(td)}}})}
              label={label}/>
          </div>
        );
      })}
    </div>
    {/* Per-item detail panels for active tests */}
    {[
      {key:"th",label:"Temperature & Humidity"},
      {key:"sf",label:"Salt Fog (96 hrs)"},
      {key:"alt",label:"Altitude"},
      {key:"ess",label:"ESS"},
      {key:"acc",label:"Acceleration"},
      {key:"incl",label:"Inclination"},
      {key:"rd",label:"Rapid Decompression"},
      {key:"ed",label:"Explosive Decompression"},
      {key:"drip",label:"Drip Test"},
      {key:"sub",label:"Submergence"},
      {key:"spray",label:"Spray Test"},
      {key:"insres",label:"Insulation Resistance & Dielectric Strength"},
    ].filter(({key})=>s.items?.[key]?.on).map(({key,label})=>{
      const item=s.items[key];
      const upd=patch=>set({...s,items:{...s.items,[key]:{...item,...patch}}});
      return(
        <div key={key} style={{background:C.panel,borderRadius:7,padding:"8px 10px",marginBottom:6,border:"1px solid "+C.red+"33"}}>
          <div style={{fontSize:10,color:C.red,fontWeight:700,marginBottom:6}}>{label}</div>
          <Row label="Spec" mb={6}>
            <Inp value={item.spec||""} onChange={v=>upd({spec:v})} width={200}/>
          </Row>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
            {item.setup!=="0"&&item.setup!==undefined&&<div>
              <div style={{fontSize:9,color:C.dim,marginBottom:2}}>Setup ($)</div>
              <Inp value={item.setup||"0"} onChange={v=>upd({setup:v})} width={80}/>
            </div>}
            <div>
              <div style={{fontSize:9,color:C.dim,marginBottom:2}}>Testing ($)</div>
              {key==="th"
                ? <span style={{fontSize:12,fontWeight:600,color:C.text,padding:"3px 6px",background:C.bg,borderRadius:5,border:"1px solid "+C.border,display:"inline-block",minWidth:80}}>
                    {(ENV_TH_PRICES[s.thDur]||1000).toLocaleString()}
                  </span>
                : <Inp value={item.testing||"0"} onChange={v=>upd({testing:v})} width={80}/>
              }
            </div>
          </div>
          {key==="th"&&<>
            <Row label="Duration" mb={4}>
              <Sel value={s.thDur||"0 to 1 Day"} onChange={v=>set({...s,thDur:v})} options={Object.keys(ENV_TH_PRICES)} width={130}/>
            </Row>
            <Row label="Custom Duration" mb={4}>
              <Inp value={s.thDurVal||""} onChange={v=>set({...s,thDurVal:v})} width={60} placeholder="e.g. 24"/>
              <Sel value={s.thDurUnit||"hours"} onChange={v=>set({...s,thDurUnit:v})}
                options={["minutes","hours","days"]} width={90}/>
              <span style={{fontSize:9,color:C.dim,marginLeft:4}}>→ used in spec text</span>
            </Row>
            <Row label="Type" mb={0}>
              <Sel value={s.thType||"Temperature & Humidity"} onChange={v=>set({...s,thType:v})}
                options={["Temperature & Humidity","Temperature Only","Humidity Only"]} width={200}/>
            </Row>
          </>}
          {key==="alt"&&<Row label="Dwell" mb={0}>
            <Sel value={s.altDwell||"1-30 min"} onChange={v=>set({...s,altDwell:v})}
              options={["1-30 min","31-60 min","1-2 hr"]} width={120}/>
          </Row>}
          {key==="ess"&&<Row label="Duration/Axis" mb={0}>
            <Inp value={s.essDur||"10 minutes"} onChange={v=>set({...s,essDur:v})} width={120}/>
          </Row>}
        </div>
      );
    })}
    <Pia s={s} set={set}/>
    <ProcReport s={s} set={set} sectionCode="53"/>
  </div>;
}

function calcEmiShifts(s){
  const L=sf(s.dimL)*2.54, W=sf(s.dimW)*2.54, H=sf(s.dimH)*2.54;
  // Cables: prefer EMI-instance value if explicitly > 0, else fall back to Setup Details cables
  const emiCables=sf(s.cables,0);
  const setupCables=sf(s.setupCables,0);
  const cables=Math.max(1,emiCables>0?emiCables:setupCables);
  const phases=Math.max(1,sf(s.phases||3,3));
  const ru=x=>x>0?Math.ceil(x):0;
  const rp=x=>Math.max(1,Math.ceil(x)); // round up, minimum 1 position
  // Rev resolution: G if checked (alone or with F); F if only F or neither
  const revF=(s.revs||{})['Rev F']||false;
  const revG=(s.revs||{})['Rev G']||false;
  const useG=revG; // G wins when both checked (conservative)
  const revLabel=useG?'461G':'461F';
  const res={};
  // CE101 / CE102 — rev × phase lookup
  // F: 1Ph=4hr, 3Ph=6hr  /  G: 1Ph=6hr, 3Ph=8hr
  const ce_F={1:4,3:6}, ce_G={1:6,3:8};
  const ceHrs=(useG?ce_G:ce_F)[phases]||(useG?ce_G[3]:ce_F[3]);
  const ce=ceHrs/8;
  res.CE101={raw:ce,rounded:ru(ce),
    bd:[["Quote time ("+revLabel+", "+phases+"-phase, "+ceHrs+"hr)",ce]]};
  res.CE102={raw:ce,rounded:ru(ce),
    bd:[["Quote time ("+revLabel+", "+phases+"-phase, "+ceHrs+"hr)",ce]]};
  // CS101 — flat 6 hr both revs, both phases
  const cs101=6/8;
  res.CS101={raw:cs101,rounded:ru(cs101),
    bd:[["Quote time (6hr flat)",cs101]]};
  // CS106 — 461F only (excluded from G test list elsewhere); 1Ph=4hr, 3Ph=3hr
  const cs106Hrs=phases===1?4:3;
  const cs106=cs106Hrs/8;
  res.CS106={raw:cs106,rounded:ru(cs106),
    bd:[["Quote time (461F only, "+phases+"-phase, "+cs106Hrs+"hr)",cs106]]};
  // CS114 — rev-aware setup/cal, 90 min/test, F/G power test counts
  // F: 1Ph=2, 3Ph=3 power tests; setup/cal = 9 hr (6 cal + 2 setup + 1 add'l 4kHz-1MHz)
  // G: 1Ph=3, 3Ph=4 power tests; setup/cal = 15 hr (6 cal + 2 setup + 1 add'l + 6 verification)
  const cs114PwrTests=phases===1?(useG?3:2):(useG?4:3);
  const cs114SetupHrs=useG?15:9;
  const cs114Setup=cs114SetupHrs/8;
  const cs114SigTime=((90*cables)/60)/8;
  const cs114PwrTime=((90*cs114PwrTests)/60)/8;
  const cs114=cs114Setup+cs114SigTime+cs114PwrTime;
  res.CS114={raw:cs114,rounded:ru(cs114),
    sigTests:cables, pwrTests:cs114PwrTests, totalTests:cables+cs114PwrTests,
    bd:[["Setup/Cal ("+revLabel+", "+cs114SetupHrs+"hr)",cs114Setup],["Signal cables (90min x "+cables+")",cs114SigTime],["Power cables (90min x "+cs114PwrTests+")",cs114PwrTime]]};
  // CS109 — Not performed by NU Labs; subcontract only, no shift cost
  res.CS109={raw:0,rounded:0,bd:[["Not performed at NU Labs -- subcontract required",0]]};
  // CS115 — Impulse Excitation; same test count as CS114, 5 min per test, 0.5 shift setup/cal
  const cs115Total=cables+cs114PwrTests;
  const cs115=0.5+((5*cs115Total)/60)/8;
  res.CS115={raw:cs115,rounded:ru(cs115),
    sigTests:cables, pwrTests:cs114PwrTests, totalTests:cs115Total,
    bd:[["Setup/Cal",0.5],["Tests (5min x "+cs115Total+")",((5*cs115Total)/60)/8]]};
  // CS116 — rev-aware power test counts (mirrors CS114), 70 min/test, 3.5 hr setup
  // F: 1Ph=2, 3Ph=3 power tests
  // G: 1Ph=3, 3Ph=4 power tests
  const cs116PwrTests=phases===1?(useG?3:2):(useG?4:3);
  const cs116Setup=3.5/8;
  const cs116SigTime=((70*cables)/60)/8;
  const cs116PwrTime=((70*cs116PwrTests)/60)/8;
  const cs116=cs116Setup+cs116SigTime+cs116PwrTime;
  res.CS116={raw:cs116,rounded:ru(cs116),
    sigTests:cables, pwrTests:cs116PwrTests, totalTests:cables+cs116PwrTests,
    bd:[["Setup/Cal/Sweep ("+revLabel+", 3.5hr)",cs116Setup],["Signal cables (70min x "+cables+")",cs116SigTime],["Power cables (70min x "+cs116PwrTests+")",cs116PwrTime]]};
  // RE101 — Radiated Emissions, Magnetic Field
  // Engineer: 60 min cal + 15 min/position. 6 sides x 2 positions/side base + 1 per cable connector.
  // Floor: never less than 1.5 shifts (12 hr).
  const re101BasePos=12; // 6 sides × 2 positions
  const re101Pos=re101BasePos+cables;
  const re101Hrs=1+(15*re101Pos)/60; // 60 min cal + 15 min/pos
  const re101Raw=Math.max(1.5,re101Hrs/8);
  res.RE101={raw:re101Raw,rounded:ru(re101Raw),
    bd:[["Cal (60min)",1/8],
        ["Positions ("+re101Pos+" pos: 12 sides + "+cables+" cables, 15min ea)",(15*re101Pos)/60/8],
        ...(re101Raw>=1.5&&re101Hrs/8<1.5?[["Floor 1.5 shifts applied",1.5-(re101Hrs/8)]]:[])]};

  // RE102 — Radiated Emissions, Electric Field, 10 kHz to 18 GHz
  // Width-only positions per engineer pricing note ("price assumes width only for E&F")
  // 461F: 1 sweep all bands. 461G: 1 sweep <30 MHz, 2 sweeps (H+V) ≥30 MHz.
  // Per-sweep times independently calibrated for F vs G per engineer doc.
  // Below 1 GHz: 200 MHz-1 GHz uses 50 cm beamwidth (35 cm cable allowance baked in, no +7).
  // ≥1 GHz bands: width-only with +7 cm cable allowance.
  const re102Pos={
    b10k_30M:  1,                          // ≤3m boundary, 1 fixed position
    b30_200M:  1,                          // ≤3m boundary, 1 fixed position
    sub1GHz:   rp(W/50),                   // 200 MHz-1 GHz, 50cm beamwidth (cable already accounted)
    b1_4:      rp((W+7)/93),               // +7cm cable allowance, 93cm beamwidth
    b4_15:     rp((W+7)/52),               // 52cm beamwidth
    b15_18:    rp((W+7)/14),               // 14cm beamwidth
  };
  // Per-sweep times (minutes) — engineer doc 461F & 461G
  const re102Times = useG
    ? {b10k_30M:3,    b30_200M:130/60, sub1GHz:340/60, b1_4:307/60, b4_15:307/60, b15_18:55/60}
    : {b10k_30M:4,    b30_200M:5,      sub1GHz:12,     b1_4:6,      b4_15:15.5,   b15_18:3.5};
  // Polarization sweeps: 461F=1 all bands; 461G=1 below 30 MHz, 2 above
  const sweepLow = 1;                  // <30 MHz: vertical only (both revs)
  const sweepHigh = useG ? 2 : 1;      // ≥30 MHz: F=1 (price assumes width only), G=2 (H+V)
  const re102Setup = 1.5;              // setup/cal baseline
  const tLow = (re102Pos.b10k_30M  * re102Times.b10k_30M  * sweepLow ) / 60 / 8;
  const t30  = (re102Pos.b30_200M  * re102Times.b30_200M  * sweepHigh) / 60 / 8;
  const tSub = (re102Pos.sub1GHz   * re102Times.sub1GHz   * sweepHigh) / 60 / 8;
  const tRe1_4 = (re102Pos.b1_4    * re102Times.b1_4      * sweepHigh) / 60 / 8;
  const tRe4_15= (re102Pos.b4_15   * re102Times.b4_15     * sweepHigh) / 60 / 8;
  const tRe15_18=(re102Pos.b15_18  * re102Times.b15_18    * sweepHigh) / 60 / 8;
  const re102 = re102Setup + tLow + t30 + tSub + tRe1_4 + tRe4_15 + tRe15_18;
  const swLabel = useG ? '2 sweeps H+V' : '1 sweep';
  res.RE102={raw:re102,rounded:ru(re102),pos:re102Pos,
    bd:[["Setup/Cal",re102Setup],
        ["10 kHz-30 MHz ("+re102Pos.b10k_30M+" pos x "+re102Times.b10k_30M+"min, V only)",tLow],
        ["30-200 MHz ("+re102Pos.b30_200M+" pos x "+re102Times.b30_200M.toFixed(2)+"min, "+swLabel+")",t30],
        ["200 MHz-1 GHz ("+re102Pos.sub1GHz+" pos x "+re102Times.sub1GHz.toFixed(2)+"min, "+swLabel+")",tSub],
        ["1-4 GHz ("+re102Pos.b1_4+" pos x "+re102Times.b1_4.toFixed(2)+"min, "+swLabel+")",tRe1_4],
        ["4-15 GHz ("+re102Pos.b4_15+" pos x "+re102Times.b4_15.toFixed(2)+"min, "+swLabel+")",tRe4_15],
        ["15-18 GHz ("+re102Pos.b15_18+" pos x "+re102Times.b15_18.toFixed(2)+"min, "+swLabel+")",tRe15_18]]};

  // RS101 — Radiated Susceptibility, Magnetic Field
  // Engineer: 3 hr setup/cal, 22 min/position, face-area positions + 1 per cable connector
  // Reduction: any single dim >30 cm → ×0.7 on per-position time only (not setup)
  const rs101FacePos={
    LW: Math.max(1,Math.ceil((L*W)/900))*2,
    LH: Math.max(1,Math.ceil((L*H)/900))*2,
    WH: Math.max(1,Math.ceil((W*H)/900))*2,
  };
  const rs101FaceTotal=rs101FacePos.LW+rs101FacePos.LH+rs101FacePos.WH;
  const rs101CableCount=cables;
  const rs101OverSized=(L>30||W>30||H>30);
  const rs101Mult=rs101OverSized?0.7:1.0;
  const rs101Setup=3/8; // 3 hr
  const rs101FaceHrs=(rs101FaceTotal*22*rs101Mult)/60;
  const rs101CableHrs=(rs101CableCount*22*rs101Mult)/60;
  const rs101=rs101Setup + rs101FaceHrs/8 + rs101CableHrs/8;
  const rs101Pos={
    ...rs101FacePos,
    cables: rs101CableCount,
    get total(){ return this.LW+this.LH+this.WH+this.cables; }
  };
  res.RS101={raw:rs101,rounded:ru(rs101),pos:rs101Pos,
    bd:[["Setup/Cal (3hr)",rs101Setup],
        ["Face positions ("+rs101FaceTotal+" pos: "+rs101FacePos.LW+" LxW + "+rs101FacePos.LH+" LxH + "+rs101FacePos.WH+" WxH, 22min ea"+(rs101OverSized?" x0.7":"")+")",rs101FaceHrs/8],
        ["Cable connectors ("+rs101CableCount+" pos, 22min ea"+(rs101OverSized?" x0.7":"")+")",rs101CableHrs/8]]};

  // RS103 — shifts and positions per band (461F/G times, F=G)
  // Engineer per-position times: 2-30=16min(2 fixed), 30-200=25min(1 fixed),
  //   200-1G=21min(89.5cm bw), 1-4G=32min(93cm bw), 4-15G=30min(52cm bw), 15-18G=12min(14cm bw)
  // Setup/Field Adj/Antenna baseline: 3.0 shifts (1 hr setup + 2 hr field adj + antenna/amp changes)
  const rs103Pos={
    b2_30:   Math.max(2, rp((200+W)/188)), // boundary = 2m + unit width; coverage 188cm; min 2
    b30_200: 1, // fixed per spec (≤3m boundary)
    b200_1G: rp(L/89.5)+rp(W/89.5),
    b1_4:    rp(L/93)+rp(W/93),
    b4_15:   rp(L/52)+rp(W/52),
    b15_18:  rp(L/14)+rp(W/14),
  };
  const t2_30=((rs103Pos.b2_30*16)/60)/8;
  const t30_200=((rs103Pos.b30_200*25)/60)/8;
  const t200_1G=((rs103Pos.b200_1G*21)/60)/8;
  const t1_4=((rs103Pos.b1_4*32)/60)/8;
  const t4_15=((rs103Pos.b4_15*30)/60)/8;
  const t15_18=((rs103Pos.b15_18*12)/60)/8;
  const rs103=3.0+t2_30+t30_200+t200_1G+t1_4+t4_15+t15_18;
  res.RS103={raw:rs103,rounded:ru(rs103),pos:rs103Pos,
    bd:[["Setup/Field Adj/Antenna",3.0],
        ["2-30 MHz ("+rs103Pos.b2_30+" pos x 16min)",t2_30],
        ["30-200 MHz ("+rs103Pos.b30_200+" pos x 25min)",t30_200],
        ["200MHz-1GHz ("+rs103Pos.b200_1G+" pos x 21min)",t200_1G],
        ["1-4 GHz ("+rs103Pos.b1_4+" pos x 32min)",t1_4],
        ["4-15 GHz ("+rs103Pos.b4_15+" pos x 30min)",t4_15],
        ["15-18 GHz ("+rs103Pos.b15_18+" pos x 12min)",t15_18]]};

  // RS105 fixed
  res.RS105={raw:1.5,rounded:1.5,bd:[["Fixed",1.5]]};
  return res;
}

function EmiForm({s,set,ti,setup}){
  // Auto-populate dims from Test Item Description if not manually set
  const autoL=ti?.dimL||""; const autoW=ti?.dimW||""; const autoH=ti?.dimH||"";
  const autoWt=ti?.wt||"";
  const autoCables=setup?.cables||""; // Auto from Setup Details
  const autoPhases=ti?.phase||""; const autoVolt=ti?.volt||"";
  // Use instance value if set, else fall back to ti / setup
  const dispL=s.dimL||autoL; const dispW=s.dimW||autoW; const dispH=s.dimH||autoH;
  const dispWt=s.weight||autoWt; const dispPhases=s.phases||autoPhases;
  const dispCables=(s.cables&&s.cables!=="0")?s.cables:autoCables;
  // Rev-aware test list: F has CS106+RS105, G has CS109+CS115
  const isRevF=(s.revs||{})['Rev F']||false;
  const isRevG=(s.revs||{})['Rev G']||false;
  const TESTS_F=["CE101","CE102","CS101","CS106","CS114","CS116","RE101","RE102","RS101","RS103","RS105"];
  const TESTS_G=["CE101","CE102","CS101","CS109","CS114","CS115","CS116","RE101","RE102","RS101","RS103"];
  // If Rev G only → G list; if Rev F only or neither → F list; if both → combined
  const TESTS=isRevG&&!isRevF ? TESTS_G : !isRevG&&isRevF ? TESTS_F : isRevG&&isRevF ? [...new Set([...TESTS_F,...TESTS_G])] : TESTS_F;
  const TEST_LABELS={
    CE101:"Conducted Emissions, Power Leads",
    CE102:"Conducted Emissions, RF Potentials, Power Leads",
    CS101:"Conducted Susceptibility, Power Leads",
    CS106:"Conducted Susceptibility, Transients (461F)",
    CS109:"Conducted Susceptibility, Structure Current (461G)",
    CS114:"Conducted Susceptibility, Bulk Cable Injection",
    CS115:"Conducted Susceptibility, Bulk Cable Injection, Impulse (461G)",
    CS116:"Conducted Susceptibility, Damped Sinusoidal Transients",
    RE101:"Radiated Emissions, Magnetic Field",
    RE102:"Radiated Emissions, Electric Field",
    RS101:"Radiated Susceptibility, Magnetic Field",
    RS103:"Radiated Susceptibility, Electric Field",
    RS105:"Radiated Susceptibility, Transients (461F)",
  };
  const PLATS=["Surface Ships","Submarines"];
  const LOCS_CAN=[
    "Below Deck","Subs Internal",
    "Aircraft Fixed Wing Internal ≥25m",
    "Ground Navy Fixed","Ground Air Force","Space System Internal",
  ];
  const LOCS_TBD=[
    "High-Gain Preamp (≥48 dB) — Feasibility TBD",
  ];
  const LOCS_CANT=[
    "Above Deck","Subs External",
    "Aircraft Fixed Wing Internal <25m","Aircraft Fixed Wing External",
    "Ground Navy Mobile","Ground Army",
  ];
  const LOCS=[...LOCS_CAN,...LOCS_TBD,...LOCS_CANT];
  const REVS=["Rev F","Rev G"];
  const [expanded,setExpanded]=useState({});

  // ── Unit detail values for warning logic ──
  const eutAmps   = sf(s.phases&&s.phases?s.phases:ti?.phase||'3',3)>=1 ? sf(ti?.amps||'0',0) : 0;
  const eutHz     = sf(ti?.hz||'0',0);
  const isSub          = (s.plats||{})['Submarines']||false;
  const isAboveDeck    = (s.locs||{})['Above Deck']||false;
  const isBelowDeck    = (s.locs||{})['Below Deck']||false;
  const isSubsInternal = (s.locs||{})['Subs Internal']||false;
  const isSubsExternal = (s.locs||{})['Subs External']||false;
  const isGndNavyFixed = (s.locs||{})['Ground Navy Fixed']||false;
  const isGndNavyMob   = (s.locs||{})['Ground Navy Mobile']||false;
  const isGndArmy      = (s.locs||{})['Ground Army']||false;
  const isGndAF        = (s.locs||{})['Ground Air Force']||false;
  const isAircraftIntBig  = (s.locs||{})['Aircraft Fixed Wing Internal ≥25m']||false;
  const isAircraftIntSm   = (s.locs||{})['Aircraft Fixed Wing Internal <25m']||false;
  const isAircraftExt  = (s.locs||{})['Aircraft Fixed Wing External']||false;
  const isSpaceInt     = (s.locs||{})['Space System Internal']||false;
  const isPreampTBD    = (s.locs||{})['High-Gain Preamp (≥48 dB) — Feasibility TBD']||false;
  const isDC           = (ti?.pwrType||'AC')==='DC';

  // ── Per-test flags: { greyed: bool, greyReason: string, warnings: string[] } ──
  const getTestFlags=(t)=>{
    const warnings=[];
    let greyed=false, greyReason='';

    if(t==='CS101'){
      if(isRevF && eutAmps>0 && eutAmps>100){
        greyed=true; greyReason='CS101 generally does not apply for EUT currents >100 A/phase (Rev F).';
      } else if(isRevG && eutAmps>0 && eutAmps>30 && eutHz>150000){
        greyed=true; greyReason='CS101 generally does not apply for >30 A/phase when operating frequency >150 kHz (Rev G).';
      } else if(isRevG && eutAmps>0 && eutAmps>30){
        warnings.push('Rev G: CS101 applies for >30 A/phase only if operating frequency ≤150 kHz AND sensitivity better than 1 µV. Verify before including.');
      }
      if(eutAmps>0 && eutAmps>18){
        warnings.push('Amplifier limit: transformer secondary current max ~23 A. Feasibility should be checked at time of test if EUT current is close to this limit.');
      }
    }

    if(t==='CS109'){
      // CS109 is never performed by NU Labs — always show as non-selectable
      greyed=true;
      greyReason=eutHz>0&&eutHz>100000
        ?'CS109 does not apply for operating frequency >100 kHz.'
        :'NU Labs does not perform CS109. This test must be subcontracted if required.';
    }

    if(t==='RS101'){
      if(eutHz>0 && eutHz>100000){
        greyed=true; greyReason='RS101 does not apply for operating frequency >100 kHz.';
      } else {
        warnings.push('RS101 applicability requires operating frequency ≤100 kHz AND sensitivity better than 1 µV. Verify with customer before including.');
        if(isSub) warnings.push('Army curve is feasible but pushes our Crown 5002 amp to its limits. Navy curve is OK.');
      }
    }

    if(t==='RS103'){
      warnings.push('NU Labs RS103 capability is limited to 10 V/m (Ships metallic below deck / Subs internal). Max frequency: 18 GHz.');
      if(isAboveDeck){
        warnings.push('Ships above deck / exposed below deck (50 V/m 2–30 MHz) requires a rented 500 W amp — subcontract or add rental cost.');
      }
      if(isSubsExternal||isAircraftExt||isGndNavyMob||isGndArmy){
        warnings.push('Selected location may require higher field strengths (>10 V/m) — verify limits with customer. Subcontracting may be required.');
      }
    }

    if(t==='RE102'){
      const re102Sub = isAboveDeck||isSubsExternal||isAircraftIntSm||isAircraftExt||isGndNavyMob||isGndArmy;
      if(re102Sub){
        greyed=true;
        greyReason='RE102 subcontract required for selected location(s): '
          +[isAboveDeck&&'Ships Above Deck',isSubsExternal&&'Subs External',
            isAircraftIntSm&&'Aircraft Fixed Wing Internal <25m',isAircraftExt&&'Aircraft Fixed Wing External',
            isGndNavyMob&&'Ground Navy Mobile',isGndArmy&&'Ground Army'].filter(Boolean).join(', ')+'.';
      } else {
        if(isAircraftIntBig) warnings.push('Aircraft Fixed Wing Internal ≥25 m: NU Labs can perform this in-house. Verify nose-to-tail length before quoting.');
        if(isSpaceInt) warnings.push('Space System Internal: May be doable — verify limits with production before committing.');
        if(isPreampTBD) warnings.push('High-gain preamp (≥48 dB) may extend RE102 capability for some limits. Feasibility not yet confirmed — check with production.');
        const re102CanDo=isBelowDeck||isSubsInternal||isGndNavyFixed||isGndAF||isAircraftIntBig||isSpaceInt||isPreampTBD;
        if(!re102CanDo) warnings.push('No location selected — verify RE102 applicability and limits with customer.');
      }
    }

    if(t==='RE101'){
      if(eutHz>0 && eutHz>100000){
        warnings.push('RE101 applicability should be verified for operating frequency >100 kHz.');
      }
    }

    if(isDC){
      if(['CS101','CS106','CS114','CS115','CS116'].includes(t)){
        warnings.push('EUT is DC powered — this test still applies but limits may differ. Confirm applicable figure with customer.');
      }
    }

    return {greyed, greyReason, warnings};
  };

  // Compute shifts from unit details dimensions
  const shifts=useMemo(()=>calcEmiShifts({dimL:dispL,dimW:dispW,dimH:dispH,cables:dispCables||"0",setupCables:setup?.cables||"0",phases:dispPhases||"3",revs:s.revs}),[dispL,dispW,dispH,dispCables,setup?.cables,dispPhases,s.revs]);

  const allSelected=TESTS.every(t=>s.tests?.[t]||false);
  const toggleAll=()=>{
    const v=!allSelected;
    const tests={};TESTS.forEach(t=>tests[t]=v);
    set({...s,tests});
  };

  const selCount=TESTS.filter(t=>s.tests?.[t]).length;
  const selShifts=TESTS.filter(t=>s.tests?.[t]).reduce((a,t)=>a+(shifts[t]?.rounded||0),0);
  const rate=sf(s.rate,EMI_SR);

  return <div>
    <Row label="Spec"><Inp value={s.spec||""} onChange={v=>set({...s,spec:v})} width={200}/></Row>
    <div style={{marginBottom:8}}>
      <div style={{fontSize:11,color:C.muted,marginBottom:4}}>Spec Revision</div>
      <div style={{display:"flex",gap:12}}>
        {REVS.map(r=>(
          <label key={r} style={{display:"flex",alignItems:"center",gap:5,cursor:"pointer"}}>
            <input type="checkbox" checked={(s.revs||{})[r]||false}
              onChange={e=>set({...s,revs:{...(s.revs||{}),[r]:e.target.checked}})}
              style={{accentColor:C.red,width:13,height:13}}/>
            <span style={{fontSize:11,color:(s.revs||{})[r]?C.red:C.muted}}>{r}</span>
          </label>
        ))}
      </div>
    </div>
    {(autoL||autoW||autoH)&&(
      <div style={{fontSize:10,color:C.accent,background:"#eef4fb",borderRadius:6,padding:"4px 8px",marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
        <span>⟳</span>
        <span>{"Auto-filled from Test Item Description — override below if needed"}</span>
      </div>
    )}
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:8}}>
      <Row label="L (in)" mb={0}><Inp value={dispL} onChange={v=>set({...s,dimL:v})} width={60}/>{s.dimL&&<span style={{fontSize:9,color:C.dim,marginLeft:2}}>▲</span>}</Row>
      <Row label="W (in)" mb={0}><Inp value={dispW} onChange={v=>set({...s,dimW:v})} width={60}/>{s.dimW&&<span style={{fontSize:9,color:C.dim,marginLeft:2}}>▲</span>}</Row>
      <Row label="H (in)" mb={0}><Inp value={dispH} onChange={v=>set({...s,dimH:v})} width={60}/>{s.dimH&&<span style={{fontSize:9,color:C.dim,marginLeft:2}}>▲</span>}</Row>
      <Row label="Weight (lbs)" mb={0}><Inp value={dispWt} onChange={v=>set({...s,weight:v})} width={60}/></Row>
      <Row label="Cables" mb={0}><Inp value={dispCables||"0"} onChange={v=>set({...s,cables:v})} width={60}/>{autoCables&&(!s.cables||s.cables==="0")&&<span style={{fontSize:9,color:C.dim,marginLeft:2}}>auto</span>}</Row>
      <Row label="Phases" mb={0}><Inp value={dispPhases||"3"} onChange={v=>set({...s,phases:v})} width={60}/>{autoPhases&&!s.phases&&<span style={{fontSize:9,color:C.dim,marginLeft:2}}>auto</span>}</Row>
    </div>
    <Row label="Shift Rate ($)"><Inp value={s.rate} onChange={v=>set({...s,rate:v})} width={80}/></Row>
    <Row label="Addl Costs ($)"><Inp value={s.addl} onChange={v=>set({...s,addl:v})} width={80}/></Row>
    <Row label="Setup Shifts"><Inp value={s.setupShifts} onChange={v=>set({...s,setupShifts:v})} width={60}/></Row>
    <Row label="Teardown Shifts"><Inp value={s.tdShifts} onChange={v=>set({...s,tdShifts:v})} width={60}/></Row>
    <div style={{marginBottom:8}}>
      <div style={{fontSize:11,color:C.muted,marginBottom:4}}>Platform</div>
      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
        {PLATS.map(p=><Toggle key={p} small checked={(s.plats||{})[p]||false}
          onChange={v=>set({...s,plats:{...(s.plats||{}),[p]:v}})} label={p}/>)}
      </div>
    </div>
    <div style={{marginBottom:8}}>
      <div style={{fontSize:11,color:C.muted,marginBottom:6}}>Location / RE102 Limits</div>
      <div style={{marginBottom:6}}>
        <div style={{fontSize:9,color:"#166534",fontWeight:700,marginBottom:4,letterSpacing:.5}}>✓ IN-HOUSE CAPABLE</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {LOCS_CAN.map(l=><Toggle key={l} small checked={(s.locs||{})[l]||false}
            onChange={v=>set({...s,locs:{...(s.locs||{}),[l]:v}})} label={l}/>)}
        </div>
      </div>
      <div style={{marginBottom:6}}>
        <div style={{fontSize:9,color:"#b7791f",fontWeight:700,marginBottom:4,letterSpacing:.5}}>? FEASIBILITY TBD</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {LOCS_TBD.map(l=><Toggle key={l} small checked={(s.locs||{})[l]||false}
            onChange={v=>set({...s,locs:{...(s.locs||{}),[l]:v}})} label={l}/>)}
        </div>
      </div>
      <div>
        <div style={{fontSize:9,color:C.red,fontWeight:700,marginBottom:4,letterSpacing:.5}}>✗ SUBCONTRACT REQUIRED</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {LOCS_CANT.map(l=><Toggle key={l} small checked={(s.locs||{})[l]||false}
            onChange={v=>set({...s,locs:{...(s.locs||{}),[l]:v}})} label={l}/>)}
        </div>
      </div>
    </div>
    <Pia s={s} set={set}/>
    <HR/>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
      <div style={{fontSize:11,color:C.muted,fontWeight:600}}>TESTS ({selCount}/{TESTS.length} selected, {selShifts} shifts)</div>
      <button onClick={toggleAll}
        style={{background:"none",border:"1px solid "+C.border,borderRadius:5,padding:"2px 10px",
          cursor:"pointer",fontSize:11,color:allSelected?C.red:C.accent,fontWeight:600}}>
        {allSelected?"Deselect All":"Select All"}
      </button>
    </div>
    {TESTS.map(t=>{
      const on=s.tests?.[t]||false;
      const sh=shifts[t];
      const isExp=expanded[t]||false;
      const {greyed,greyReason,warnings}=getTestFlags(t);
      // Determine row state: greyed=N/A (red), hasWarning=amber, else green
      const hasWarnings=warnings.length>0;
      const rowBg=greyed?(on?"#fef2f2":C.panel):hasWarnings?(on?"#fffbeb":C.panel):(on?"#f0fdf4":C.panel);
      const rowBorder=greyed?"#fca5a5":hasWarnings?(on?"#b7791f":C.border):(on?"#86efac":C.border);
      const keyColor=greyed?C.muted:hasWarnings?(on?"#92400e":C.text):(on?"#166534":C.text);
      const labelColor=greyed?C.dim:hasWarnings?(on?"#b45309":C.dim):(on?"#15803d":C.dim);
      return <div key={t} style={{marginBottom:4}}>
        <div style={{display:"flex",alignItems:"center",gap:6,
          background:rowBg,
          border:"1px solid "+rowBorder,
          borderRadius:6,padding:"5px 8px",
          opacity:greyed?0.7:1}}>
          <input type="checkbox" checked={on}
            onChange={e=>set({...s,tests:{...s.tests,[t]:e.target.checked}})}
            disabled={t==="CS109"}
            style={{accentColor:greyed?C.red:hasWarnings?"#b7791f":"#166534",width:13,height:13,flexShrink:0,cursor:t==="CS109"?"not-allowed":"pointer"}}/>
          <span style={{fontSize:11,fontWeight:600,color:keyColor,minWidth:50}}>{t}</span>
          <span style={{fontSize:10,color:labelColor,flex:1,marginLeft:2}}>{TEST_LABELS[t]||""}</span>
          {greyed&&<span style={{fontSize:9,color:"#6b7a8d",background:"#e8ecf0",borderRadius:4,padding:"1px 5px",flexShrink:0}}>N/A</span>}
          {sh&&!greyed&&<span style={{fontSize:10,color:C.muted,flexShrink:0,marginLeft:4}}>
            {sh.rounded} shift{sh.rounded!==1?"s":""}
          </span>}
          {t==="RS103"&&on&&(
            <div style={{display:"flex",alignItems:"center",gap:4,marginLeft:4}}>
              <span style={{fontSize:10,color:C.warn,flexShrink:0}}>Amp $</span>
              <input type="text" value={s.rs103amp||"5000"}
                onChange={e=>set({...s,rs103amp:e.target.value})}
                style={{...inp,width:60,fontSize:10,padding:"2px 5px"}}/>
            </div>
          )}
          {sh&&sh.bd&&<button onClick={()=>setExpanded({...expanded,[t]:!isExp})}
            style={{background:"none",border:"none",color:C.accent,cursor:"pointer",fontSize:11,padding:"0 4px"}}>
            {isExp?"▲":"▼"}
          </button>}
        </div>
        {/* Grey-out reason banner */}
        {greyed&&(
          <div style={{background:"#f0f2f5",border:"1px solid #d0d7de",borderTop:"none",
            borderRadius:"0 0 6px 6px",padding:"5px 10px",display:"flex",gap:6,alignItems:"flex-start"}}>
            <span style={{fontSize:12,flexShrink:0}}>ℹ️</span>
            <span style={{fontSize:10,color:"#6b7a8d",lineHeight:1.5}}>{greyReason}</span>
          </div>
        )}
        {/* Warning banners */}
        {!greyed&&warnings.length>0&&(
          <div style={{background:"#fffbeb",border:"1px solid #b7791f",borderTop:"none",
            borderRadius:"0 0 6px 6px",padding:"6px 10px",display:"flex",flexDirection:"column",gap:4}}>
            {warnings.map((w,i)=>(
              <div key={i} style={{display:"flex",gap:6,alignItems:"flex-start"}}>
                <span style={{fontSize:12,flexShrink:0}}>⚠️</span>
                <span style={{fontSize:10,color:"#7b4f12",lineHeight:1.5}}>{w}</span>
              </div>
            ))}
          </div>
        )}
        {/* CS109 — always subcontracted, prominent banner under greyed row */}
        {t==="CS109"&&greyed&&(
          <div style={{background:"#fef2f2",border:"1px solid #dc2626",borderTop:"none",
            borderRadius:"0 0 6px 6px",padding:"8px 10px",display:"flex",gap:8,alignItems:"flex-start"}}>
            <span style={{fontSize:15,flexShrink:0}}>🚫</span>
            <span style={{fontSize:10,color:"#7f1d1d",lineHeight:1.6}}>
              <b>NU Labs does not perform CS109.</b> If this test is required by the specification, it must be <b>subcontracted</b>. Add a separate subcontract line item to this quote and notify the customer.
            </span>
          </div>
        )}
        {isExp&&sh&&(
          <div style={{background:"#f7f9fb",border:"1px solid "+C.border,borderTop:"none",
            borderRadius:"0 0 6px 6px",padding:"6px 10px"}}>
            {sh.bd.map(([lbl,val],i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:10,color:C.muted,marginBottom:2}}>
                <span>{lbl}</span>
                <span style={{fontFamily:"monospace"}}>{val.toFixed(4)} shifts</span>
              </div>
            ))}
            <div style={{fontSize:10,color:C.text,fontWeight:600,borderTop:"1px solid "+C.border,marginTop:4,paddingTop:4,display:"flex",justifyContent:"space-between"}}>
              <span>Total (rounded up)</span>
              <span style={{fontFamily:"monospace"}}>{sh.rounded} shifts = {"$"}{r25(Math.round(sh.rounded*rate)).toLocaleString()}</span>
            </div>
          </div>
        )}
      </div>;
    })}
    {selShifts>0&&(()=>{
      const selTests=TESTS.filter(t=>s.tests?.[t]);
      const hasRS103=selTests.includes("RS103");
      const rs103Amt=hasRS103?sf(s.rs103amp,5000):0;
      const shiftTotal=r25(Math.round(selShifts*rate));
      const grandTotal=r25(shiftTotal+rs103Amt);
      return(
        <div style={{fontSize:11,color:C.redDim,fontWeight:600,marginTop:6,padding:"6px 8px",background:"#fdf3f2",borderRadius:6}}>
          <div>{"Testing: "}{selShifts}{" shifts x $"}{rate.toLocaleString()}{" = $"}{shiftTotal.toLocaleString()}</div>
          {rs103Amt>0&&<div style={{marginTop:3}}>RS103 amplifier budget: +${rs103Amt.toLocaleString()}</div>}
          {rs103Amt>0&&<div style={{marginTop:3,borderTop:"1px solid #f5c6c6",paddingTop:3}}>Suggested Testing Total: ${grandTotal.toLocaleString()}</div>}
        </div>
      );
    })()}
    <ProcReport s={s} set={set} procPrice={3425} reportPrice={2850} sectionCode="21"/>
  </div>;
}

function PqForm({s,set,ti}){
  const autoPhase=ti?.phase||"";
  const PQ_P1=[
    {key:"5.3.1",label:"Grounding (susceptibility) test",sh:0.5,sh3p:null},
    {key:"5.3.2",label:"User equipment power profile test",sh:1.0,sh3p:null},
    {key:"5.3.3",label:"Voltage and frequency maximum departure tolerance test",sh:1.0,sh3p:null},
    {key:"5.3.4",label:"Voltage and frequency transient tolerance and recovery test",sh:1.0,sh3p:null},
    {key:"5.3.5",label:"Voltage spike (susceptibility) test",sh:1.5,sh3p:2.0},
    {key:"5.3.6",label:"Emergency conditions (susceptibility) test",sh:2.0,sh3p:null},
    {key:"5.3.7",label:"Current waveform (emission) test",sh:0.75,sh3p:1.0},
    {key:"5.3.8",label:"Voltage and frequency modulation test",sh:2.0,sh3p:null},
    {key:"5.3.9",label:"Simulated human body impedance ground current test",sh:0.75,sh3p:null},
    {key:"5.3.10.1",label:"Equipment line-to-ground voltage test",sh:0.5,sh3p:null},
    {key:"5.3.10.2",label:"Equipment line-to-ground voltage test (AGD)",sh:0.5,sh3p:null},
  ];
  const PQ_300B=[
    {key:"B5.3.1",label:"Voltage and frequency tolerance test",sh:1.0,sh3p:null},
    {key:"B5.3.2",label:"Voltage and frequency transient tolerance and recovery test",sh:1.0,sh3p:null},
    {key:"B5.3.3",label:"Voltage spike test",sh:1.5,sh3p:2.0},
    {key:"B5.3.4",label:"Emergency condition test",sh:2.0,sh3p:null},
    {key:"B5.3.5",label:"Grounding test",sh:0.5,sh3p:null},
    {key:"B5.3.6",label:"User equipment power profile test",sh:1.0,sh3p:null},
    {key:"B5.3.7",label:"Current waveform test",sh:0.75,sh3p:1.0},
    {key:"B5.3.8",label:"Voltage and frequency modulation test",sh:2.0,sh3p:null},
    {key:"B5.3.9",label:"Simulated human body leakage current test",sh:0.75,sh3p:null},
    {key:"B5.3.10.1",label:"Equipment insulation resistance test",sh:0.5,sh3p:null},
    {key:"B5.3.10.2",label:"Active ground detection test",sh:0.5,sh3p:null},
  ];
  const rate=sf(s.rate,PQ_SR);
  const is3ph=sf(s.phases||autoPhase||3,3)>=3;
  // Use phase-aware shifts
  const getShifts=r=>is3ph&&r.sh3p!=null?r.sh3p:r.sh;
  const p1Shifts=PQ_P1.reduce((a,r)=>a+(s.rows?.[r.key]?getShifts(r):0),0);
  const b3Shifts=PQ_300B.reduce((a,r)=>a+(s.rows?.[r.key]?getShifts(r):0),0);
  const totalShifts=p1Shifts+b3Shifts;
  const su=r25(sf(s.setupShifts,1.5)*rate), td=r25(sf(s.tdShifts,1.0)*rate);
  const testCost=r25(totalShifts*rate);
  const allP1=PQ_P1.every(r=>s.rows?.[r.key]);
  const allB3=PQ_300B.every(r=>s.rows?.[r.key]);
  const toggleP1=()=>{const v=!allP1;const rows={...s.rows};PQ_P1.forEach(r=>rows[r.key]=v);set({...s,rows});};
  const toggleB3=()=>{const v=!allB3;const rows={...s.rows};PQ_300B.forEach(r=>rows[r.key]=v);set({...s,rows});};

  const renderTable=(rows,title,allSel,onToggleAll)=>(
    <div style={{marginBottom:12}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
        <div style={{fontSize:11,color:C.accent,fontWeight:700}}>{title}</div>
        <button onClick={onToggleAll}
          style={{background:"none",border:"1px solid "+C.border,borderRadius:5,padding:"2px 8px",
            cursor:"pointer",fontSize:10,color:allSel?C.red:C.accent,fontWeight:600}}>
          {allSel?"Deselect All":"Select All"}
        </button>
      </div>
      <div style={{border:"1px solid "+C.border,borderRadius:7,overflow:"hidden"}}>
        <div style={{display:"grid",gridTemplateColumns:"20px 80px 1fr 60px",
          background:C.panel,padding:"4px 8px",fontSize:9,color:C.dim,fontWeight:700,gap:6}}>
          <div/>
          <div>Section</div>
          <div>Requirement</div>
          <div style={{textAlign:"right"}}>Shifts</div>
        </div>
        {rows.map((r,i)=>{
          const checked=s.rows?.[r.key]||false;
          const sh=getShifts(r);
          return(
            <div key={r.key} style={{display:"grid",gridTemplateColumns:"20px 80px 1fr 60px",
              padding:"5px 8px",gap:6,alignItems:"center",
              background:checked?"#f0fdf4":i%2===0?C.card:C.panel,
              borderTop:"1px solid "+(checked?"#86efac":C.border)}}>
              <input type="checkbox" checked={checked}
                onChange={e=>{const rows={...s.rows};rows[r.key]=e.target.checked;set({...s,rows});}}
                style={{accentColor:"#166534",width:12,height:12}}/>
              <span style={{fontSize:10,fontWeight:600,color:checked?"#166534":C.accent}}>{r.key.replace("B","")}</span>
              <span style={{fontSize:10,color:checked?"#15803d":C.text}}>{r.label}</span>
              <span style={{fontSize:10,color:C.muted,textAlign:"right",fontFamily:"monospace"}}>
                {sh}{sh!==r.sh&&" *"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );

  return <div>
    <Row label="Shift Rate ($)"><Inp value={s.rate} onChange={v=>set({...s,rate:v})} width={80}/></Row>
    <Row label="Phases">
      <Inp value={s.phases||autoPhase||"3"} onChange={v=>set({...s,phases:v})} width={50}/>
      {autoPhase&&!s.phases&&<span style={{fontSize:9,color:C.accent,marginLeft:4}}>auto from TI</span>}
      {is3ph&&<span style={{fontSize:10,color:C.warn,marginLeft:6}}>3-phase: shifts adjusted</span>}
    </Row>
    <Row label="Setup Shifts"><Inp value={s.setupShifts} onChange={v=>set({...s,setupShifts:v})} width={60}/></Row>
    <Row label="Teardown Shifts"><Inp value={s.tdShifts} onChange={v=>set({...s,tdShifts:v})} width={60}/></Row>
    <Pia s={s} set={set}/>
    <Toggle small checked={s.cw||false} onChange={v=>set({...s,cw:v})} label="Current Waveform (facility power)"/>
    {sf(s.rate,PQ_SR)>=440&&(
      <div style={{fontSize:11,color:C.warn,marginBottom:4}}>⚠ 440 VAC — source rental required.</div>
    )}
    {(()=>{
      const eutAmps=sf(ti?.amps||'0',0);
      const numPhases=sf(s.phases||autoPhase||'3',3);
      const isSubPQ=s.submarine||false;
      const agdSelected=(s.rows||{})['5.3.10.2']||(s.rows||{})['B5.3.10.2'];
      const cwSelected=(s.rows||{})['5.3.7']||(s.rows||{})['B5.3.7'];
      const spikeSelected=(s.rows||{})['5.3.5']||(s.rows||{})['B5.3.3'];
      const pqWarnings=[];
      if(eutAmps>0&&eutAmps<1&&cwSelected)
        pqWarnings.push('Current Waveform test (5.3.7 / B5.3.7) is not required for EUT currents <1 A per NAVSEA. Consider removing this test.');
      if(agdSelected)
        pqWarnings.push('AGD test (5.3.10.2 / B5.3.10.2): If required (common for submarines), a high-voltage power supply rental will likely be needed.');
      if(numPhases>3||sf(ti?.phase||'3',3)>3)
        pqWarnings.push('Unit has multiple power feeds — discuss with customer which lines require testing and which tests apply to each feed before finalizing scope.');
      if(spikeSelected)
        pqWarnings.push('Voltage Spike testing: NU Labs uses an IEC 61000-4-5 waveform instead of the MIL-STD waveform, as noted in the Test Specifications.');
      if(pqWarnings.length===0)return null;
      return(
        <div style={{background:"#fffbeb",border:"1px solid #b7791f",borderRadius:7,padding:"8px 10px",marginTop:6,marginBottom:4}}>
          {pqWarnings.map((w,i)=>(
            <div key={i} style={{display:"flex",gap:6,alignItems:"flex-start",marginBottom:i<pqWarnings.length-1?5:0}}>
              <span style={{fontSize:12,flexShrink:0}}>⚠️</span>
              <span style={{fontSize:10,color:"#7b4f12",lineHeight:1.5}}>{w}</span>
            </div>
          ))}
        </div>
      );
    })()}
    <HR/>
    {renderTable(PQ_P1,"MIL-STD-1399 Section 300 Part 1",allP1,toggleP1)}
    {renderTable(PQ_300B,"MIL-STD-1399 Section 300B",allB3,toggleB3)}
    <HR/>
    <div style={{fontSize:11,color:C.dim,marginBottom:4}}>
      {"Setup: "}{money(su)}{"  ·  Testing: "}{money(testCost)}{" ("}{totalShifts}{" shifts)  ·  TD: "}{money(td)}
    </div>
    <div style={{fontSize:12,color:C.redDim,fontWeight:600,marginBottom:4}}>
      {"PQ Total: "}{money(su+testCost+td)}
    </div>
    <ProcReport s={s} set={set} procPrice={2925} reportPrice={2450} sectionCode="22"/>
  </div>;
}

function DcmForm({s,set}){
  const rate=sf(s.rate,DCM_SR);
  const total=(sf(s.setupShifts,1.5)+sf(s.testShifts,1.0))*rate;
  return <div>
    <Row label="Spec"><Inp value={s.spec||""} onChange={v=>set({...s,spec:v})} width={200}/></Row>
    <Row label="Shift Rate ($)"><Inp value={s.rate} onChange={v=>set({...s,rate:v})} width={80}/></Row>
    <Row label="Setup Shifts"><Inp value={s.setupShifts} onChange={v=>set({...s,setupShifts:v})} width={60}/></Row>
    <Row label="Testing Shifts"><Inp value={s.testShifts} onChange={v=>set({...s,testShifts:v})} width={60}/></Row>
    <HR/>
    <div style={{fontSize:12,color:C.redDim,fontWeight:600}}>
      {"DCM Total: "}{money(total)}
    </div>
    <Pia s={s} set={set}/>
    <ProcReport s={s} set={set} procPrice={1950} reportPrice={1500} sectionCode="23"/>
  </div>;
}

function HfvForm({s,set,setup}){
  const pm=s.pia||1;
  const fab=setup?Math.round(sf(setup.fabHours)*sf(setup.techRate,175)):0;
  const std=sf(s.stdSetup||s.setup||500);
  const addl=sf(s.addlCosts,0);
  const setupTotal=std+fab+addl;
  const autoTesting=hfvTestingPrice(s.dur||30);
  return <div>
    <Row label="Spec"><Inp value={s.spec||""} onChange={v=>set({...s,spec:v})} width={200}/></Row>
    <Row label="Duration/Axis (min)"><Inp value={s.dur} onChange={v=>set({...s,dur:v,testing:String(hfvTestingPrice(v))})} width={60}/>
      <span style={{fontSize:10,color:C.dim,marginLeft:6}}>→ ${autoTesting.toLocaleString()}</span>
    </Row>
    <Pia s={s} set={set}/>
    <HR/>
    <PRow label="Std Setup" val={s.stdSetup||s.setup||"500"} onChange={v=>set({...s,stdSetup:v})}/>
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
      <input type="checkbox" checked={s.showSetup!==false}
        onChange={e=>set({...s,showSetup:e.target.checked})}
        style={{cursor:"pointer"}}/>
      <label style={{fontSize:11,color:C.dim,cursor:"pointer"}}>Include Setup Line</label>
    </div>
    <PRow label="Add'l Costs" val={s.addlCosts||"0"} onChange={v=>set({...s,addlCosts:v})}/>
    <PRow label="Testing (auto)" val={s.testing} onChange={v=>set({...s,testing:v})}/>
    <div style={{fontSize:10,background:C.panel,borderRadius:5,padding:"5px 8px",marginBottom:6}}>
      <span style={{color:C.dim}}>Setup: </span>
      <span style={{color:C.text,fontWeight:600}}>{money(setupTotal)}</span>
      <span style={{color:C.dim,fontSize:9}}>{" = $"+std.toLocaleString()+(fab>0?" + $"+fab.toLocaleString()+" fab":""+(addl>0?" + $"+addl.toLocaleString()+" addl":""))+(pm>1?" x "+pm+" PIA":"")}</span>
    </div>
    <ProcReport s={s} set={set} sectionCode="52"/>
  </div>;
}

function CopyEmailButton({qi,ti,emis,pqs,dcms,showToast}){
  const firstName=(qi.contact||"").trim().split(/\s+/)[0]||"";
  const hasSpecialTest=emis.some(s=>s.on)||pqs.some(s=>s.on)||dcms.some(s=>s.on);
  const emailBody=
    "Dear "+(firstName||qi.contact||"[Contact]")+",\n\n"+
    "Please see the attached quotation "+(qi.opp||"[Quote #]")+
    " for testing the "+(ti.item||"[Item]")+
    ". If you have any questions, don't hesitate to reach out.\n\n"+
    (hasSpecialTest?"Additional attachments have been included with further testing descriptions.\n\n":"")+
    "Also attached is our Terms and Conditions page for your signature and return with your purchase order.\n\n"+
    "Thank you,";
  return(
    <button onClick={()=>{navigator.clipboard.writeText(emailBody);showToast("✉️ Email copied to clipboard","success",3000);}}
      style={{background:"rgba(255,255,255,0.12)",border:"1px solid rgba(255,255,255,0.2)",
        borderRadius:5,padding:"3px 10px",color:"#fff",fontWeight:700,fontSize:11,cursor:"pointer"}}>
      📋 Copy Email
    </button>
  );
}

function ShoForm({s,set,setup}){
  const pm=s.pia||1;
  const fab=setup?Math.round(sf(setup.fabHours)*sf(setup.techRate,175)):0;
  const std=sf(s.stdSetup||s.setup||500);
  const addl=sf(s.addlCosts,0);
  const hfvOn=false; // HFV discount handled in calcSummary
  const setupTotal=std+fab+addl;
  return <div>
    <Row label="Spec"><Inp value={s.spec||""} onChange={v=>set({...s,spec:v})} width={200}/></Row>
    <Row label="Pulse Shape">
      <Sel value={s.shape} onChange={v=>set({...s,shape:v})}
        options={["Half Sine","Sawtooth","Bench Handling","Drop Shock"]} width={160}/>
    </Row>
    <Row label="G Level"><Inp value={s.gLevel||""} onChange={v=>set({...s,gLevel:v})} width={70}/></Row>
    <Row label="Pulse Duration (ms)"><Inp value={s.pDur||""} onChange={v=>set({...s,pDur:v})} width={70}/></Row>
    <Row label="# Pulses"><Inp value={s.nPulses||""} onChange={v=>set({...s,nPulses:v})} width={60}/></Row>
    <Pia s={s} set={set}/>
    <HR/>
    <PRow label="Std Setup" val={s.stdSetup||s.setup||"500"} onChange={v=>set({...s,stdSetup:v})}/>
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
      <input type="checkbox" checked={s.showSetup!==false}
        onChange={e=>set({...s,showSetup:e.target.checked})}
        style={{cursor:"pointer"}}/>
      <label style={{fontSize:11,color:C.dim,cursor:"pointer"}}>Include Setup Line</label>
    </div>
    <PRow label="Add'l Costs" val={s.addlCosts||"0"} onChange={v=>set({...s,addlCosts:v})}/>
    <PRow label="Testing" val={s.testing} onChange={v=>set({...s,testing:v})}/>
    <div style={{fontSize:10,background:C.panel,borderRadius:5,padding:"5px 8px",marginBottom:6}}>
      <span style={{color:C.dim}}>Setup: </span>
      <span style={{color:C.text,fontWeight:600}}>{money(setupTotal)}</span>
      <span style={{color:C.dim,fontSize:9}}>{" = $"+std.toLocaleString()+(fab>0?" + $"+fab.toLocaleString()+" fab":"")+(addl>0?" + $"+addl.toLocaleString()+" addl":"")+(pm>1?" x "+pm+" PIA":"")}</span>
      {fab===0&&<span style={{color:C.dim,fontSize:9}}>{" (25% disc if HFV active)"}</span>}
    </div>
    <ProcReport s={s} set={set} sectionCode="51"/>
  </div>;
}

function InstForm({s,set}){
  const ITEMS=[
    {key:"shock",label:"Shock Instrumentation",price:525,ch:true},
    {key:"cmShock",label:"Contact Monitoring (Shock)",price:350,ch:true},
    {key:"vib",label:"Vib Addl Channels",price:325,ch:true},
    {key:"cmVib",label:"Contact Monitoring (Vibe)",price:750,ch:true},
    {key:"hsv",label:"High Speed Video",price:1950,ch:false},
  ];
  return <div>
    {ITEMS.map(item=>{
      const on=s.items?.[item.key]?.on||false;
      const channels=s.items?.[item.key]?.channels??"1";
      return(
        <div key={item.key} style={{background:on?"#fdf3f2":C.panel,
          border:"1px solid "+(on?C.red+"44":C.border),borderRadius:7,padding:"8px 10px",marginBottom:6}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <Toggle small checked={on}
              onChange={v=>set({...s,items:{...s.items,[item.key]:v?{on:true,channels:"1"}:{on:false,channels:"1"}}})}
              label={item.label+" — "+money(item.price)+(item.ch?"/ch":"")}/>
            {on&&item.ch&&(
              <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:5}}>
                <span style={{fontSize:11,color:C.muted}}>Ch:</span>
                <Inp value={channels}
                  onChange={v=>set({...s,items:{...s.items,[item.key]:{...s.items?.[item.key],channels:v}}})}
                  width={45}/>
              </div>
            )}
          </div>
        </div>
      );
    })}
  </div>;
}

function OtForm({s,set}){
  const PCODE_OPTS=[
    {code:"11",label:"Noise Susceptibility"},
    {code:"12",label:"Airborne / Structureborne"},
    {code:"32",label:"High Speed Video"},
    {code:"33",label:"Instrumentation"},
    {code:"41",label:"CoC / Test Report"},
    {code:"42",label:"Test Procedure"},
    {code:"43",label:"EMI Report"},
    {code:"43",label:"DC Mag Report"},
    {code:"43",label:"PQ Report"},
    {code:"44",label:"EMI Procedure"},
    {code:"44",label:"DC Mag Procedure"},
    {code:"44",label:"PQ Procedure"},
    {code:"51",label:"EMI Testing"},
    {code:"51",label:"Power Quality"},
    {code:"51",label:"DC Magnetics"},
    {code:"52",label:"HFV / Shock Other"},
    {code:"53",label:"Temp & Humidity"},
    {code:"54",label:"ESS"},
    {code:"55",label:"Salt Fog"},
    {code:"56",label:"Altitude / Decomp"},
    {code:"57",label:"Acceleration"},
    {code:"58",label:"Drip / Sub / Spray"},
    {code:"59",label:"Insulation Resistance & Dielectric Strength"},
    {code:"91",label:"Medium Weight Shock"},
    {code:"92",label:"Lightweight Shock"},
    {code:"93",label:"Inclination"},
    {code:"94",label:"Vibration"},
    {code:"95",label:"Hydrostatic"},
    {code:"96",label:"Tear Down"},
    {code:"98",label:"Subcontract"},
  ];
  // Weekday: $300 min call + $262.50/tech/hr | Weekend: $825 min call + $350/tech/hr
  const calcOT=(r)=>{
    const techs=sf(r.techs,1), hrs=sf(r.hours,0);
    const isWknd=r.type==="Weekend";
    const min=isWknd?825:300;
    const rate=isWknd?350:262.5;
    return min+techs*hrs*rate;
  };
  const add=()=>set({...s,rows:[...s.rows,{label:"",type:"Weekday",techs:"1",hours:"0",pcode:"94"}]});
  const rem=i=>set({...s,rows:s.rows.filter((_,j)=>j!==i)});
  const upd=(i,k,v)=>set({...s,rows:s.rows.map((r,j)=>j===i?{...r,[k]:v}:r)});
  return <div>
    {s.rows.map((r,i)=>{
      const total=calcOT(r);
      const techs=sf(r.techs,1), hrs=sf(r.hours,0);
      const isWknd=r.type==="Weekend";
      const min=isWknd?825:300;
      const rate=isWknd?350:262.5;
      const pcodeLabel=PCODE_OPTS.find(p=>p.code===r.pcode);
      return(
      <div key={i} style={{background:C.panel,border:"1px solid "+C.border,borderRadius:7,padding:"8px 10px",marginBottom:6}}>
        <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",marginBottom:5}}>
          <Inp value={r.label} onChange={v=>upd(i,"label",v)} width={140} placeholder="Description"/>
          <Sel value={r.type} onChange={v=>upd(i,"type",v)} options={["Weekday","Weekend"]} width={95}/>
          <span style={{fontSize:11,color:C.muted}}>Techs:</span>
          <Inp value={r.techs} onChange={v=>upd(i,"techs",v)} width={40}/>
          <span style={{fontSize:11,color:C.muted}}>Hrs:</span>
          <Inp value={r.hours} onChange={v=>upd(i,"hours",v)} width={40}/>
          <button onClick={()=>rem(i)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:14,padding:"0 4px"}}>✕</button>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:4}}>
          <span style={{fontSize:9,color:C.dim}}>Product Code:</span>
          <select value={r.pcode||"94"} onChange={e=>upd(i,"pcode",e.target.value)}
            style={{...sel,fontSize:10,padding:"2px 6px"}}>
            {PCODE_OPTS.map(p=><option key={p.code} value={p.code}>{p.code} – {p.label}</option>)}
          </select>
        </div>
        <div style={{fontSize:10,color:C.accent,background:"#eef4fb",borderRadius:5,padding:"3px 8px"}}>
          <span style={{fontWeight:600}}>{money(total)}</span>
          <span style={{color:C.dim}}>{" = $"+min.toLocaleString()+" min call + "+techs+"x"+hrs+"hrsx$"+rate+"/hr"+(isWknd?" (weekend)":"")}</span>
        </div>
      </div>
      );
    })}
    <button onClick={add}
      style={{background:"none",border:"1px dashed "+C.border,borderRadius:7,
        color:C.muted,padding:"7px 14px",cursor:"pointer",fontSize:12,width:"100%"}}>
      + Add Overtime Row
    </button>
  </div>;
}

function CustomForm({s,set}){
  const PCODE_OPTS=[
    {code:"11",label:"Noise"},{code:"12",label:"AB/SB Noise"},
    {code:"32",label:"High Speed Video"},{code:"33",label:"Instrumentation"},
    {code:"41",label:"Report/CoC"},{code:"42",label:"Procedure"},
    {code:"43",label:"EMI Report"},{code:"43",label:"DC Mag Report"},{code:"43",label:"PQ Report"},
    {code:"44",label:"EMI Procedure"},{code:"44",label:"DC Mag Procedure"},{code:"44",label:"PQ Procedure"},
    {code:"51",label:"EMI"},{code:"51",label:"Power Quality"},{code:"51",label:"DC Magnetics"},{code:"52",label:"HFV/Shock Other"},
    {code:"53",label:"T&H"},{code:"54",label:"ESS"},{code:"55",label:"Salt Fog"},
    {code:"56",label:"Altitude"},{code:"57",label:"Acceleration"},{code:"58",label:"Drip/Sub/Spray"},
    {code:"59",label:"Insulation Resistance"},
    {code:"91",label:"MW Shock"},{code:"92",label:"LW Shock"},{code:"93",label:"Inclination"},
    {code:"94",label:"Vibration"},{code:"95",label:"Hydrostatic"},{code:"96",label:"Tear Down"},
    {code:"98",label:"Subcontract"},
  ];
  const add=()=>set({...s,rows:[...s.rows,{label:"Custom Item",price:"0",pcode:"94"}]});
  const rem=i=>set({...s,rows:s.rows.filter((_,j)=>j!==i)});
  const upd=(i,k,v)=>set({...s,rows:s.rows.map((r,j)=>j===i?{...r,[k]:v}:r)});
  return <div>
    {s.rows.map((r,i)=>(
      <div key={i} style={{background:C.panel,borderRadius:7,padding:"7px 10px",marginBottom:6}}>
        <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:4}}>
          <select value={r.pcode||"94"} onChange={e=>upd(i,"pcode",e.target.value)}
            style={{...sel,fontSize:10,padding:"2px 5px",width:160}}>
            {PCODE_OPTS.map(p=><option key={p.code} value={p.code}>{p.code} – {p.label}</option>)}
          </select>
          <Inp value={r.label} onChange={v=>upd(i,"label",v)} width={170}/>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <span style={{fontSize:11,color:C.muted}}>$</span>
          <Inp value={r.price} onChange={v=>upd(i,"price",v)} width={90} right/>
          <button onClick={()=>rem(i)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:14}}>✕</button>
        </div>
      </div>
    ))}
    <button onClick={add}
      style={{background:"none",border:"1px dashed "+C.border,borderRadius:7,
        color:C.muted,padding:"7px 14px",cursor:"pointer",fontSize:12,width:"100%"}}>
      + Add Custom Line Item
    </button>
  </div>;
}

function AbForm({s,set,setup}){
  const dr=setup?Math.round(sf(setup.holes)*0.5*sf(setup.techRate,175)*(setup.drillTap?1.5:1)):0;
  const fab=setup?Math.round(sf(setup.fabHours)*sf(setup.techRate,175)):0;
  const std=sf(s.stdSetup||s.setup||1000);
  const addl=sf(s.addlCosts,0);
  const setupTotal=std+dr+fab+addl;
  return <div>
    <Row label="Spec"><Inp value={s.spec||""} onChange={v=>set({...s,spec:v})} width={200}/></Row>
    <HR/>
    <PRow label="Std Setup" val={s.stdSetup||s.setup||"1000"} onChange={v=>set({...s,stdSetup:v})}/>
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
      <input type="checkbox" checked={s.showSetup!==false}
        onChange={e=>set({...s,showSetup:e.target.checked})}
        style={{cursor:"pointer"}}/>
      <label style={{fontSize:11,color:C.dim,cursor:"pointer"}}>Include Setup Line</label>
    </div>
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
      <input type="checkbox" checked={s.showSetup!==false}
        onChange={e=>set({...s,showSetup:e.target.checked})}
        style={{cursor:"pointer"}}/>
      <label style={{fontSize:11,color:C.dim,cursor:"pointer"}}>Include Setup Line</label>
    </div>
    <PRow label="Add'l Costs" val={s.addlCosts||"0"} onChange={v=>set({...s,addlCosts:v})}/>
    <PRow label="Testing" val={s.testing} onChange={v=>set({...s,testing:v})}/>
    <div style={{fontSize:10,background:C.panel,borderRadius:5,padding:"5px 8px",marginBottom:6}}>
      <span style={{color:C.dim}}>Setup: </span>
      <span style={{color:C.text,fontWeight:600}}>{money(setupTotal)}</span>
      <span style={{color:C.dim,fontSize:9}}>{" = $"+std.toLocaleString()+(dr>0?" + $"+dr.toLocaleString()+" drill":"")+(fab>0?" + $"+fab.toLocaleString()+" fab":"")+(addl>0?" + $"+addl.toLocaleString()+" addl":"")}</span>
    </div>
    <ProcReport s={s} set={set} sectionCode="12"/>
  </div>;
}

function SbForm({s,set,setup}){
  const dr=setup?Math.round(sf(setup.holes)*0.5*sf(setup.techRate,175)*(setup.drillTap?1.5:1)):0;
  const fab=setup?Math.round(sf(setup.fabHours)*sf(setup.techRate,175)):0;
  const std=sf(s.stdSetup||s.setup||850);
  const addl=sf(s.addlCosts,0);
  const setupTotal=std+dr+fab+addl;
  return <div>
    <Row label="Spec"><Inp value={s.spec||""} onChange={v=>set({...s,spec:v})} width={200}/></Row>
    <HR/>
    <PRow label="Std Setup" val={s.stdSetup||s.setup||"850"} onChange={v=>set({...s,stdSetup:v})}/>
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
      <input type="checkbox" checked={s.showSetup!==false}
        onChange={e=>set({...s,showSetup:e.target.checked})}
        style={{cursor:"pointer"}}/>
      <label style={{fontSize:11,color:C.dim,cursor:"pointer"}}>Include Setup Line</label>
    </div>
    <PRow label="Add'l Costs" val={s.addlCosts||"0"} onChange={v=>set({...s,addlCosts:v})}/>
    <PRow label="Testing" val={s.testing} onChange={v=>set({...s,testing:v})}/>
    <div style={{fontSize:10,background:C.panel,borderRadius:5,padding:"5px 8px",marginBottom:6}}>
      <span style={{color:C.dim}}>Setup: </span>
      <span style={{color:C.text,fontWeight:600}}>{money(setupTotal)}</span>
      <span style={{color:C.dim,fontSize:9}}>{" = $"+std.toLocaleString()+(dr>0?" + $"+dr.toLocaleString()+" drill":"")+(fab>0?" + $"+fab.toLocaleString()+" fab":"")+(addl>0?" + $"+addl.toLocaleString()+" addl":"")}</span>
    </div>
    <ProcReport s={s} set={set} sectionCode="12"/>
  </div>;
}

function BudgetSection({budget,setBudget}){
  const add=()=>setBudget({...budget,rows:[...budget.rows,{desc:"",qty:"1",unitCost:"0"}]});
  const rem=i=>setBudget({...budget,rows:budget.rows.filter((_,j)=>j!==i)});
  const upd=(i,k,v)=>setBudget({...budget,rows:budget.rows.map((r,j)=>j===i?{...r,[k]:v}:r)});
  const mp=sf(budget.markup,25)/100;
  const total=budget.rows.reduce((s,r)=>s+sf(r.qty,1)*sf(r.unitCost,0),0);

  if(!budget.on) return(
    <div style={{marginBottom:10}}>
      <Toggle small checked={false} onChange={v=>setBudget({...budget,on:v})} label="Budget Materials"/>
    </div>
  );
  return(
    <div style={{...card}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
        <Toggle small checked={budget.on} onChange={v=>setBudget({...budget,on:v})} label="BUDGET MATERIALS"/>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontSize:11,color:C.muted}}>Markup %</span>
          <Inp value={budget.markup} onChange={v=>setBudget({...budget,markup:v})} width={50} right/>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 55px 75px 75px 22px",gap:4,marginBottom:4}}>
        {["Description","Qty","Unit Cost","Marked Up",""].map((h,i)=>(
          <div key={i} style={{fontSize:9,color:C.dim,padding:"0 4px"}}>{h}</div>
        ))}
      </div>
      {budget.rows.map((r,i)=>(
        <div key={i} style={{display:"grid",gridTemplateColumns:"1fr 55px 75px 75px 22px",gap:4,marginBottom:4,alignItems:"center"}}>
          <Inp value={r.desc} onChange={v=>upd(i,"desc",v)} width="100%"/>
          <Inp value={r.qty} onChange={v=>upd(i,"qty",v)} width={55} right/>
          <Inp value={r.unitCost} onChange={v=>upd(i,"unitCost",v)} width={75} right/>
          <div style={{fontSize:11,color:C.muted,textAlign:"right",paddingRight:4}}>
            {"$"}{Math.round(sf(r.qty,1)*sf(r.unitCost,0)*(1+mp)).toLocaleString()}
          </div>
          <button onClick={()=>rem(i)}
            style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:13,padding:0}}>✕</button>
        </div>
      ))}
      <button onClick={add}
        style={{background:"none",border:"1px dashed "+C.border,borderRadius:7,
          color:C.muted,padding:"5px 12px",cursor:"pointer",fontSize:11,width:"100%",marginTop:4}}>
        + Add Item
      </button>
      {total>0&&(
        <div style={{marginTop:8,fontSize:12,color:C.redDim,fontWeight:600,textAlign:"right"}}>
          {"Hard: $"}{Math.round(total).toLocaleString()}{" · Marked up: $"}{Math.round(total*(1+mp)).toLocaleString()}
        </div>
      )}
      {/* Internal notes — budget PDF only */}
      <div style={{marginTop:12,borderTop:"1px solid "+C.border,paddingTop:10}}>
        <div style={{fontSize:9,color:C.accent,fontWeight:700,letterSpacing:2,marginBottom:3}}>INTERNAL NOTES</div>
        <div style={{fontSize:9,color:C.dim,marginBottom:4}}>For internal use only. Appears on budget PDF, not the quote.</div>
        <textarea
          value={budget.notes||""}
          onChange={e=>setBudget({...budget,notes:e.target.value})}
          placeholder="Add internal notes for this budget (vendor info, lead times, sourcing, etc.)..."
          rows={3}
          style={{...inp,width:"100%",resize:"vertical",fontSize:11,lineHeight:1.6}}/>
      </div>
    </div>
  );
}

// ── Quote Search panel ─────────────────────────────────────────────────────────
import { supabase } from "./supabaseClient";

// ── Supabase storage helpers ──────────────────────────────────────────────────
// ── PDF Save-As helper ───────────────────────────────────────────────────────
async function savePdfAs(doc, suggestedName) {
  const blob = doc.output('blob');
  // Try modern File System Access API (Chrome 86+) for native Save As dialog
  if(window.showSaveFilePicker){
    try{
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types:[{description:'PDF File',accept:{'application/pdf':['.pdf']}}],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    }catch(e){
      if(e.name==='AbortError')return; // user cancelled
      // Fall through to legacy method
    }
  }
  // Legacy fallback — auto-download (same as before)
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}

async function saveQuoteToSupabase(quote, autoSpecs, autoNotes) {
  const row = {
    id: quote.id || undefined,
    opportunity:      quote.qi?.opp    || quote.opp    || null,
    customer:         quote.qi?.account|| quote.customer|| null,
    rfq:              quote.qi?.rfq    || quote.rfq    || null,
    revision:         quote.qi?.rev    || null,
    stage:            quote.qi?.stage  || quote.stage  || null,
    total:            quote.total      || null,
    job_number:       quote.wonInfo?.jobNum  || null,
    po_number:        quote.wonInfo?.poNum   || null,
    won_date:         (()=>{const d=quote.wonInfo?.wonDate;if(!d)return null;const p=new Date(d);return isNaN(p)?null:p.toISOString().slice(0,10);})(),
    approval_status:  quote.approval?.status || "none",
    won_approval_status: quote.wonApproval?.status || "none",
    submitted_by:     quote.approval?.submittedBy || null,
    approved_by:      quote.approval?.decidedBy   || null,
    specifications:   combineSpecs(quote.ti?.tiSpecs, autoSpecs) || null,
    notes:            combineSpecs(quote.ti?.tiNotes, autoNotes) || null,
    line_items:       (quote.summary?.lines||[]).map((line,i)=>{
      const ov=(quote.lineOverrides||{})[i]||{};
      if(ov.deleted)return null; // exclude deleted lines
      return {...line, val: ov.price!==undefined ? parseFloat(ov.price)||0 : line.val};
    }).filter(Boolean) || null,
    budget_items:     quote.budget?.rows   || null,
    budget_markup:    quote.budget?.markup ? parseFloat(quote.budget.markup) : null,
    budget_notes:     quote.budget?.notes  || null,
    data:             quote,
    search_text:      [
      quote.qi?.opp    || quote.opp    || "",
      quote.qi?.account|| quote.customer|| "",
      quote.qi?.rfq    || quote.rfq    || "",
      quote.qi?.rev    || "",
      quote.qi?.contact|| "",
      quote.qi?.email  || "",
      quote.qi?.prepby || "",
      quote.qi?.stage  || quote.stage  || "",
      quote.qi?.relatedOpps || "",
      quote.wonInfo?.jobNum  || "",
      quote.wonInfo?.poNum   || "",
      quote.ti?.item   || "",
      quote.ti?.model  || "",
      quote.ti?.drawing|| "",
      combineSpecs(quote.ti?.tiSpecs, autoSpecs) || "",
      combineSpecs(quote.ti?.tiNotes, autoNotes) || "",
      (quote.summary?.lines||[]).map(l=>l.label||"").join(" "),
    ].filter(Boolean).join(" ").toLowerCase(),
  };

  let data, error;
  if (row.id) {
    const { id, ...updateRow } = row;
    ({ data, error } = await supabase
      .from("quotes")
      .update(updateRow)
      .eq("id", id)
      .select("id")
      .single());
  } else {
    ({ data, error } = await supabase
      .from("quotes")
      .insert(row)
      .select("id")
      .single());
  }

  if (error) { console.error("Supabase save error:", error); return null; }
  return data.id;
}

async function loadQuotesFromSupabase() {
  // Load recent quotes (last 2 years) for approval queue badge — search handles full history
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 2);
  let allData = [];
  let from = 0;
  const batchSize = 1000;
  while(true){
    const { data, error } = await supabase
      .from("quotes")
      .select("id, opportunity, customer, rfq, revision, stage, total, approval_status, won_approval_status, updated_at, data")
      .gte("updated_at", cutoff.toISOString())
      .order("updated_at", { ascending: false })
      .range(from, from + batchSize - 1);
    if (error) { console.error("Supabase load error:", error); break; }
    if (!data || data.length === 0) break;
    allData = allData.concat(data);
    if (data.length < batchSize) break;
    from += batchSize;
  }

  const map = {};
  allData.forEach(row => {
    const q = row.data || {};
    map[row.id] = {
      ...q,
      id:          row.id,
      opp:         row.opportunity || q.opp,
      customer:    row.customer    || q.customer,
      rfq:         row.rfq         || q.rfq,
      total:       row.total       ?? q.total,
      savedAt:     row.updated_at,
      approval:    { ...(q.approval||{}), status: row.approval_status || q.approval?.status || "none" },
      wonApproval: { ...(q.wonApproval||{}), status: row.won_approval_status || q.wonApproval?.status || "none" },
    };
  });
  return map;
}

async function loadPendingQuotes() {
  // Fetch only metadata first (no data blob) — avoids full table scan timeout
  const { data, error } = await supabase
    .from("quotes")
    .select("id, opportunity, customer, rfq, revision, stage, total, approval_status, won_approval_status, updated_at")
    .eq("approval_status", "pending")
    .order("updated_at", { ascending: false })
    .limit(50);

  const { data: wonData } = await supabase
    .from("quotes")
    .select("id, opportunity, customer, rfq, revision, stage, total, approval_status, won_approval_status, updated_at")
    .eq("won_approval_status", "pending_won")
    .order("updated_at", { ascending: false })
    .limit(50);

  // Now fetch the data blobs only for the actual pending IDs
  const pendingIds = [...(data||[]), ...(wonData||[])].map(r=>r.id);
  let blobMap = {};
  if(pendingIds.length > 0){
    const { data: blobs } = await supabase
      .from("quotes")
      .select("id, data")
      .in("id", pendingIds);
    (blobs||[]).forEach(b => { blobMap[b.id] = b.data || {}; });
  }

  // Merge metadata rows to look like the old shape
  const mergeBlob = row => ({ ...row, data: blobMap[row.id] || {} });
  const mergedData    = (data||[]).map(mergeBlob);
  const mergedWonData = (wonData||[]).map(mergeBlob);
  if (error) { console.error("Supabase pending load error:", error); return {}; }

  const map = {};
  [...mergedData, ...mergedWonData].forEach(row => {
    const q = row.data || {};
    map[row.id] = {
      ...q,
      id:          row.id,
      opp:         row.opportunity || q.opp,
      customer:    row.customer    || q.customer,
      rfq:         row.rfq         || q.rfq,
      total:       row.total       ?? q.total,
      savedAt:     row.updated_at,
      approval:    { ...(q.approval||{}), status: row.approval_status || q.approval?.status || "none" },
      wonApproval: { ...(q.wonApproval||{}), status: row.won_approval_status || q.wonApproval?.status || "none" },
    };
  });
  return map;
}

async function deleteQuoteFromSupabase(id) {
  const { error } = await supabase.from("quotes").delete().eq("id", id);
  if (error) console.error("Supabase delete error:", error);
}

// ── Client / Contact picker ───────────────────────────────────────────────────
function ClientContactPicker({qi, setQi, resetKey}){
  const [clientSearch, setClientSearch]     = useState(qi.account||"");
  const [clientResults, setClientResults]   = useState([]);
  const [clientOpen, setClientOpen]         = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);
  const [contacts, setContacts]             = useState([]);
  const [contactOpen, setContactOpen]       = useState(false);
  const [customContact, setCustomContact]   = useState(false);
  const clientRef  = useRef(null);
  const contactRef = useRef(null);
  const clientTimer = useRef(null);
  const externalUpdate = useRef(false);

  // When resetKey changes (quote loaded), sync everything from qi
  useEffect(()=>{
    setClientSearch(qi.account||"");
    setSelectedClient(null);
    setContacts([]);
    setCustomContact(false);
  },[resetKey]);

  useEffect(()=>{
    clearTimeout(clientTimer.current);
    if(!clientSearch.trim()){setClientResults([]);return;}
    clientTimer.current=setTimeout(async()=>{
      const term=clientSearch.trim();
      const {data,error}=await supabase
        .from("clients")
        .select("id, name, address, city, state, zip")
        .ilike("name",`%${term}%`)
        .order("name")
        .limit(30);
      if(error)console.error("Clients query error:",error);
      setClientResults(data||[]);
    },250);
    return()=>clearTimeout(clientTimer.current);
  },[clientSearch]);

  useEffect(()=>{
    if(!selectedClient){setContacts([]);return;}
    supabase
      .from("contacts")
      .select("id, first_name, last_name, email")
      .eq("client_id", selectedClient.id)
      .order("last_name")
      .then(({data})=>setContacts(data||[]));
  },[selectedClient]);

  useEffect(()=>{
    const h=e=>{
      if(clientRef.current&&!clientRef.current.contains(e.target))setClientOpen(false);
      if(contactRef.current&&!contactRef.current.contains(e.target))setContactOpen(false);
    };
    document.addEventListener("mousedown",h);
    return()=>document.removeEventListener("mousedown",h);
  },[]);

  const selectClient=(c)=>{
    setSelectedClient(c);
    setClientSearch(c.name);
    const billTo=c.address||"";
    const billToCity=[c.city,c.state,c.zip].filter(Boolean).join(", ");
    setQi(q=>({...q, account:c.name, contact:"", email:"", billTo, billToCity}));
    setClientOpen(false);
    setClientResults([]);
    setCustomContact(false);
  };

  const selectContact=(ct)=>{
    const name=((ct.first_name||"")+" "+(ct.last_name||"")).trim();
    setQi(q=>({...q, contact:name, email:ct.email||""}));
    setContactOpen(false);
    setCustomContact(false);
  };

  const ddStyle={position:"absolute",top:"100%",left:0,right:0,zIndex:2000,
    background:"#fff",border:"1px solid "+C.border,borderRadius:7,
    boxShadow:"0 4px 16px rgba(0,0,0,0.12)",maxHeight:200,overflowY:"auto",marginTop:2};
  const itemBase={padding:"8px 12px",cursor:"pointer",fontSize:12,
    borderBottom:"1px solid #f0f2f5",transition:"background .1s"};
  const hasContacts=contacts.length>0;

  return(
    <div>
      <div style={{marginBottom:6,position:"relative"}} ref={clientRef}>
        <div style={{fontSize:9,color:C.dim,marginBottom:2}}>Account</div>
        <input
          value={clientSearch}
          onChange={e=>{
            setClientSearch(e.target.value);
            setQi(q=>({...q,account:e.target.value}));
            setSelectedClient(null);
            setContacts([]);
            setClientOpen(true);
          }}
          onFocus={()=>setClientOpen(true)}
          placeholder="Type to search clients..."
          style={{...inp,width:"100%"}}/>
        {clientOpen&&clientResults.length>0&&(
          <div style={ddStyle}>
            {clientResults.map(c=>(
              <div key={c.id}
                onMouseDown={()=>selectClient(c)}
                style={itemBase}
                onMouseEnter={e=>e.currentTarget.style.background=C.panel}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                {c.name}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{marginBottom:6,position:"relative"}} ref={contactRef}>
        <div style={{fontSize:9,color:C.dim,marginBottom:2,display:"flex",alignItems:"center",gap:6}}>
          <span>Contact</span>
          {hasContacts&&!customContact&&(
            <span style={{color:C.accent,fontSize:9,cursor:"pointer",fontWeight:600}}
              onClick={()=>{setCustomContact(true);setContactOpen(false);}}>
              + custom
            </span>
          )}
          {customContact&&(
            <span style={{color:C.muted,fontSize:9,cursor:"pointer"}}
              onClick={()=>setCustomContact(false)}>
              back to list
            </span>
          )}
        </div>
        {hasContacts&&!customContact?(
          <div style={{position:"relative"}}>
            <div
              onClick={()=>setContactOpen(o=>!o)}
              style={{...inp,width:"100%",cursor:"pointer",display:"flex",alignItems:"center",
                justifyContent:"space-between",userSelect:"none",
                color:qi.contact?C.text:C.dim}}>
              <span>{qi.contact||"Select a contact..."}</span>
              <span style={{fontSize:9,color:C.dim}}>▼</span>
            </div>
            {contactOpen&&(
              <div style={ddStyle}>
                {contacts.map(ct=>{
                  const name=((ct.first_name||"")+" "+(ct.last_name||"")).trim();
                  return(
                    <div key={ct.id}
                      onMouseDown={()=>selectContact(ct)}
                      style={itemBase}
                      onMouseEnter={e=>e.currentTarget.style.background=C.panel}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <div style={{fontWeight:600}}>{name||"(no name)"}</div>
                      {ct.email&&<div style={{fontSize:10,color:C.muted}}>{ct.email}</div>}
                    </div>
                  );
                })}
                <div
                  onMouseDown={()=>{setCustomContact(true);setContactOpen(false);}}
                  style={{...itemBase,color:C.accent,fontWeight:600}}
                  onMouseEnter={e=>e.currentTarget.style.background=C.panel}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  + Enter custom contact
                </div>
              </div>
            )}
          </div>
        ):(
          <input
            value={qi.contact||""}
            onChange={e=>setQi(q=>({...q,contact:e.target.value}))}
            placeholder="Contact name"
            style={{...inp,width:"100%"}}/>
        )}
      </div>

      <div style={{marginBottom:6}}>
        <div style={{fontSize:9,color:C.dim,marginBottom:2}}>Email</div>
        <input
          value={qi.email||""}
          onChange={e=>setQi(q=>({...q,email:e.target.value}))}
          placeholder="Email address"
          style={{...inp,width:"100%"}}/>
      </div>
    </div>
  );
}

function QuoteSearch({onLoad}){
  const [search,setSearch]=useState("");
  const [results,setResults]=useState([]);
  const [open,setOpen]=useState(false);
  const [loading,setLoading]=useState(false);
  const [showModal,setShowModal]=useState(false);
  const [modalResults,setModalResults]=useState([]);
  const [modalLoading,setModalLoading]=useState(false);
  const ref=useRef(null);
  const searchTimer=useRef(null);
  const inputRef=useRef(null);

  const buildRow=(row)=>{
    const q=row.data||{};
    return{
      ...q,
      id:row.id,
      opp:row.opportunity||q.opp,
      rev:row.revision||q.qi?.rev||q.rev||"",
      customer:row.customer||q.customer,
      rfq:row.rfq||q.rfq,
      total:row.total??q.total,
      savedAt:row.updated_at,
      stage:row.stage||q.qi?.stage||"",
      item:q.ti?.item||"",
      approval:{...(q.approval||{}),status:row.approval_status||q.approval?.status||"none"},
    };
  };

  const doSearch=async(term,limit=50)=>{
    let query=supabase
      .from("quotes")
      .select("id, opportunity, customer, rfq, revision, stage, total, approval_status, won_approval_status, updated_at, data")
      .order("opportunity",{ascending:false})
      .limit(limit);
    if(term.trim()){
      const t=term.trim().toLowerCase();
      query=query.or(
        `opportunity.ilike.%${t}%,customer.ilike.%${t}%,rfq.ilike.%${t}%,revision.ilike.%${t}%,stage.ilike.%${t}%,search_text.ilike.%${t}%`
      );
    }
    const {data,error}=await query;
    if(error||!data)return[];
    return data.map(buildRow);
  };

  // Dropdown search (debounced, 50 results)
  useEffect(()=>{
    if(!open)return;
    clearTimeout(searchTimer.current);
    searchTimer.current=setTimeout(async()=>{
      setLoading(true);
      const r=await doSearch(search,50);
      setResults(r);
      setLoading(false);
    },300);
    return()=>clearTimeout(searchTimer.current);
  },[open,search]);

  // Close dropdown on outside click
  useEffect(()=>{
    const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};
    document.addEventListener("mousedown",h);
    return()=>document.removeEventListener("mousedown",h);
  },[]);

  // Enter key opens full modal
  const handleKeyDown=async(e)=>{
    if(e.key!=="Enter")return;
    e.preventDefault();
    setOpen(false);
    setShowModal(true);
    setModalLoading(true);
    // Fetch all matching results (no limit)
    let allResults=[], from=0, batchSize=500;
    while(true){
      let query=supabase
        .from("quotes")
        .select("id, opportunity, customer, rfq, revision, stage, total, approval_status, won_approval_status, updated_at, data")
        .order("opportunity",{ascending:false})
        .range(from, from+batchSize-1);
      if(search.trim()){
        const t=search.trim().toLowerCase();
        query=query.or(`opportunity.ilike.%${t}%,customer.ilike.%${t}%,rfq.ilike.%${t}%,revision.ilike.%${t}%,stage.ilike.%${t}%,search_text.ilike.%${t}%`);
      }
      const {data,error}=await query;
      if(error||!data||data.length===0)break;
      allResults=allResults.concat(data.map(buildRow));
      if(data.length<batchSize)break;
      from+=batchSize;
    }
    setModalResults(allResults);
    setModalLoading(false);
  };

  const handleSelect=(q)=>{
    onLoad(q);
    setOpen(false);
    setShowModal(false);
    setSearch("");
  };

  const stageColor=(stage)=>{
    if(!stage)return C.dim;
    if(stage.includes("Won"))return"#1e8449";
    if(stage.includes("Lost")||stage.includes("Cancelled"))return"#c0392b";
    if(stage.includes("Pending")||stage.includes("RFQ"))return"#b7791f";
    return C.muted;
  };

  return(
    <>
    <div ref={ref} style={{position:"relative"}}>
      <div style={{display:"flex",alignItems:"center",gap:6,background:C.card,
        border:"1px solid "+C.border,borderRadius:7,padding:"5px 10px",cursor:"text"}}
        onClick={()=>{setOpen(true);inputRef.current?.focus();}}>
        <span style={{fontSize:14,color:C.muted}}>🔍</span>
        <input ref={inputRef} value={search}
          onChange={e=>{setSearch(e.target.value);setOpen(true);}}
          onKeyDown={handleKeyDown}
          placeholder="Search quotes… (Enter for full results)"
          style={{border:"none",outline:"none",background:"transparent",color:C.text,fontSize:12,width:220}}/>
      </div>
      {open&&(
        <div style={{position:"absolute",top:"calc(100% + 4px)",right:0,width:360,
          background:C.card,border:"1px solid "+C.border,borderRadius:10,
          boxShadow:"0 4px 20px rgba(0,0,0,0.15)",zIndex:1000,maxHeight:380,overflow:"hidden",
          display:"flex",flexDirection:"column"}}>
          <div style={{padding:"8px 12px",borderBottom:"1px solid "+C.border,
            fontSize:11,color:C.muted,fontWeight:600,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span>{loading?"Searching…":results.length+" found"+(results.length===50?" · Press Enter for all":"")}</span>
            {!loading&&results.length===50&&(
              <button onClick={()=>inputRef.current?.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}))}
                style={{background:"none",border:"none",color:C.accent,fontSize:10,cursor:"pointer",fontWeight:600,padding:0}}>
                Show all →
              </button>
            )}
          </div>
          <div style={{overflowY:"auto",flex:1}}>
            {!loading&&results.length===0&&(
              <div style={{padding:20,textAlign:"center",color:C.dim,fontSize:12}}>No quotes found</div>
            )}
            {results.map(q=>(
              <div key={q.id} onClick={()=>handleSelect(q)}
                style={{padding:"10px 14px",cursor:"pointer",borderBottom:"1px solid "+C.border,transition:"background .1s"}}
                onMouseEnter={e=>e.currentTarget.style.background=C.panel}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <div style={{fontWeight:600,fontSize:13,color:C.text,marginBottom:2}}>{q.opp||"Untitled"}</div>
                <div style={{fontSize:11,color:C.muted}}>{q.customer||""}</div>
                <div style={{fontSize:10,color:C.dim,marginTop:2}}>
                  {q.savedAt?new Date(q.savedAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):""}
                  {q.total?" · "+money(q.total):""}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>

    {/* ── Full Search Modal ── */}
    {showModal&&(
      <div style={{position:"fixed",inset:0,zIndex:3000,background:"rgba(0,0,0,0.5)",
        display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:60}}
        onClick={e=>{if(e.target===e.currentTarget)setShowModal(false);}}>
        <div style={{background:"#fff",borderRadius:14,width:760,maxWidth:"95vw",maxHeight:"80vh",
          boxShadow:"0 8px 40px rgba(0,0,0,0.3)",display:"flex",flexDirection:"column"}}>

          {/* Header */}
          <div style={{padding:"16px 24px",borderBottom:"1px solid #e8ecf0",display:"flex",alignItems:"center",gap:12}}>
            <span style={{fontSize:18}}>🔍</span>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,fontSize:15,color:"#1a2332"}}>
                Search Results{search.trim()?` — "${search.trim()}"`:""}</div>
              <div style={{fontSize:11,color:"#6b7a8d",marginTop:2}}>
                {modalLoading?"Searching…":modalResults.length+" quote"+(modalResults.length!==1?"s":"")+" found"}
              </div>
            </div>
            <button onClick={()=>setShowModal(false)}
              style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#6b7a8d"}}>×</button>
          </div>

          {/* Column headers */}
          <div style={{display:"grid",gridTemplateColumns:"2fr 2fr 2fr 1.5fr 1fr",gap:8,
            padding:"8px 24px",background:"#f8f9fb",borderBottom:"1px solid #e8ecf0",
            fontSize:9,color:"#9aa5b1",fontWeight:700,letterSpacing:.8}}>
            <div>OPPORTUNITY</div><div>ACCOUNT</div><div>TEST ITEM</div><div>STAGE</div><div>MODIFIED</div>
          </div>

          {/* Results */}
          <div style={{flex:1,overflowY:"auto"}}>
            {modalLoading&&(
              <div style={{padding:40,textAlign:"center",color:"#6b7a8d",fontSize:13}}>Searching…</div>
            )}
            {!modalLoading&&modalResults.length===0&&(
              <div style={{padding:40,textAlign:"center",color:"#6b7a8d",fontSize:13}}>No quotes found</div>
            )}
            {!modalLoading&&modalResults.map(q=>(
              <div key={q.id}
                onClick={()=>handleSelect(q)}
                style={{display:"grid",gridTemplateColumns:"2fr 2fr 2fr 1.5fr 1fr",gap:8,
                  padding:"10px 24px",borderBottom:"1px solid #f0f2f5",cursor:"pointer",
                  transition:"background .1s"}}
                onMouseEnter={e=>e.currentTarget.style.background="#f8f9fb"}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <div style={{fontWeight:600,fontSize:12,color:"#1a2332",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                  {q.opp||"—"}
                </div>
                <div style={{fontSize:11,color:"#6b7a8d",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                  {q.customer||"—"}
                </div>
                <div style={{fontSize:11,color:"#6b7a8d",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                  {q.item||"—"}
                </div>
                <div style={{fontSize:11,fontWeight:600,color:stageColor(q.stage),overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                  {q.stage||"—"}
                </div>
                <div style={{fontSize:10,color:"#9aa5b1",whiteSpace:"nowrap"}}>
                  {q.savedAt?new Date(q.savedAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"—"}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )}
    </>
  );
}

// ── Initial state factories ───────────────────────────────────────────────────
const newAb=()=>({id:Date.now(),on:false,showSetup:true,spec:"",rev:"1474",testing:"2850",stdSetup:"1000",addlCosts:"0",proc:false,report:false});
const newSb=()=>({id:Date.now(),on:false,showSetup:true,spec:"",rev:"167 Type II",testing:"2650",stdSetup:"850",addlCosts:"0",proc:false,report:false});
const newVib=()=>({id:Date.now(),on:false,showSetup:true,cat:"LAB Vibration (MIL-STD-167)",spec:"",freqRange:"",circ:false,hydroPre:false,hydroPost:false,hydroPrice:"500",pia:0,testing:"3250",stdSetup:"900",addlCosts:"0",proc:false,report:false,fixtureFab:{on:false,hours:"0",techRate:"175"}});
const newShock=()=>({id:Date.now(),on:false,showSetup:true,cat:"Medium Weight",spec:"",grade:"A",class_:"I",type_:"A",location:"Hull",submarine:false,orientation:"Unrestricted",blows:"",fromVib:false,hydroPre:false,hydroPost:false,hydroPrice:"500",pia:0,testing:"4575",stdSetup:"1500",addlCosts:"0",proc:false,report:false,fixtureFab:{on:false,hours:"0",techRate:"175"}});
const newNoise=()=>({id:Date.now(),on:false,showSetup:true,spec:"",level:"<=140dB",oaspl:"",chamber:"Speakerbox",durVal:"30",durUnit:"minutes",compBudget:"0",pia:0,testing:"3950",stdSetup:"1000",addlCosts:"0",proc:false,report:false});
const newEnv=()=>({id:Date.now(),on:false,showSetup:true,spec:"",items:{},thDur:"0 to 1 Day",thType:"Temperature & Humidity",proc:false,report:false});
const newEmi=()=>({id:Date.now(),on:false,spec:"",rate:"1600",addl:"0",setupShifts:"3.0",tdShifts:"1.0",dimL:"",dimW:"",dimH:"",weight:"",cables:"",rs103amp:"",plats:{},locs:{},revs:{},pia:0,tests:{},proc:false,report:false});
const newPq=()=>({id:Date.now(),on:false,rate:"1450",setupShifts:"1.5",tdShifts:"1.0",rows:{},pia:0,cw:false,proc:false,report:false});
const newDcm=()=>({id:Date.now(),on:false,spec:"",rate:"1600",setupShifts:"1.5",testShifts:"3.0",pia:0,proc:false,report:false});
const newHfv=()=>({id:Date.now(),on:false,showSetup:true,spec:"",dur:"30",pia:0,testing:"1225",stdSetup:"500",addlCosts:"0",proc:false,report:false});
const newSho=()=>({id:Date.now(),on:false,showSetup:true,spec:"",shape:"Half Sine",pia:0,testing:"1250",stdSetup:"500",addlCosts:"0",proc:false,report:false});

// ── Summary calculation helper ────────────────────────────────────────────────
// Compute a section's total setup = stdSetup + global drilling + global fab + addlCosts
function sectionSetup(s, globalSetup){
  const std   = sf(s.stdSetup, sf(s.setup, 0));  // fallback to old 'setup' field for loaded quotes
  const drill = sf(globalSetup.holes) * 0.5 * sf(globalSetup.techRate, 175) * (globalSetup.drillTap ? 1.5 : 1);
  const fab   = sf(globalSetup.fabHours) * sf(globalSetup.techRate, 175);
  const addl  = sf(s.addlCosts, 0);
  return Math.round(std + drill + fab + addl);
}

function pcode(label){
  const dl=label.toLowerCase();
  if(dl.includes("procedure")||dl.includes("proc"))return dl.includes("emi")||dl.includes("dcm")||dl.includes("dc mag")||dl.includes("pq")||dl.includes("power quality")?"44":"42";
  if(dl.includes("report"))return dl.includes("emi")||dl.includes("dcm")||dl.includes("dc mag")||dl.includes("pq")||dl.includes("power quality")?"43":"41";
  if(dl.includes("certificate"))return "41";
  if(dl.includes("tear down")||dl.includes("teardown"))return "96";
  if(dl.includes("hydrostatic"))return "95";
  if(dl.includes("circulating"))return "94";
  if(dl.includes("high frequency vib")||dl.includes("hfv"))return "52";
  if(dl.includes("shock (other)"))return "52";
  if(dl.includes("airborne")||dl.includes("structureborne"))return "12";
  if(dl.includes("noise"))return "11";
  if(dl.includes("emi")||dl.includes("dc magnet")||dl.includes("power quality")||dl.includes(" pq ")||dl.startsWith("pq ")||dl.includes(" dcm ")||dl.startsWith("dcm "))return "51";
  if(dl.includes("humidity")||dl.includes("temperature")||dl.includes("t&h"))return "53";
  if(dl.includes("ess")||dl.includes("environmental stress"))return "54";
  if(dl.includes("salt fog"))return "55";
  if(dl.includes("altitude")||dl.includes("rapid decomp")||dl.includes("explosive decomp"))return "56";
  if(dl.includes("acceleration"))return "57";
  if(dl.includes("drip")||dl.includes("submerg")||dl.includes("spray"))return "58";
  if(dl.includes("inclination"))return "93";
  if(dl.includes("medium weight")||(dl.includes("shock")&&dl.includes("medium")))return "91";
  if(dl.includes("lightweight")||(dl.includes("shock")&&dl.includes("light")))return "92";
  if(dl.includes("shock"))return "91";
  if(dl.includes("high speed video")||dl.includes("hsv"))return "32";
  if(dl.includes("instrument")||dl.includes("channel")||dl.includes("contact monitor"))return "33";
  if(dl.includes("vibration"))return "94";
  if(dl.includes("overtime"))return "";
  return "";
}

function calcSummary(vibs,shocks,noises,envs,hfvs,shos,emis,pqs,dcms,abs,sbs,inst,ot,custom,td,coc,sub,globalPR,budget,globalSetup,splitProcReport,modalAnalysis,fixtureDrawing,inStockModal){
  const lines=[];
  let currentUnit=0;
  let seq=0;
  const add=(label,val,_bucket,code)=>{const v=r25(sf(val));if(v>0)lines.push({label,val:v,code:code||pcode(label),unit:currentUnit,seq:seq++});};
  // addUser: like add but allows $0 (for user-defined custom items)
  const addUser=(label,val,_bucket,code)=>{const v=r25(sf(val));lines.push({label,val:v,code:code||pcode(label),unit:currentUnit,seq:seq++,userDefined:true});};

  // Vibration instances
  vibs.filter(s=>s.on).forEach((s,idx)=>{
    const pre=idx>0?" #"+(idx+1)+(s.identifier?" ("+s.identifier+")":""):"";
    const pm=s.pia||1;
    // Fixture Fabrication — first line for this test block
    if(s.fixtureFab?.on){
      const fabLabel="Fixture Fabrication – Vibration"+(pre?pre:"");
      const laborAmt=r25(sf(s.fixtureFab.hours,0)*sf(s.fixtureFab.techRate,175));
      lines.push({label:fabLabel,val:laborAmt,code:"94",unit:currentUnit,seq:seq++,isFabLine:true});
    }
    if(s.hydroPre)add("Vib"+pre+" – Pre-Test Hydrostatic",sf(s.hydroPrice||500),null,"95");
    if(s.circ)add("Circulating System",2500,null,"94");
    if(s.showSetup!==false)add("Vibration"+pre+" – Setup",sectionSetup(s,globalSetup)*pm,null,"94");
    // Vib instrumentation: between setup and testing
    if(inst.on){
      if(inst.items?.vib?.on)add("Vib Instrumentation",325*sf(inst.items.vib.channels,1),null,"33");
      if(inst.items?.cmVib?.on)add("Contact Monitoring (Vibe)",750*sf(inst.items.cmVib.channels,1),null,"33");
    }
    add("Vibration"+pre+" – Testing",sf(s.testing)*pm,null,"94");
    if(s.hydroPost)add("Vib"+pre+" – Post-Test Hydrostatic",sf(s.hydroPrice||500),null,"95");
    (s.customRows||[]).forEach(r=>{if(sf(r.price)>0)add(r.label||"Custom",r.price,null,r.code||pcode(r.label||""));});
  });

  // Shock instances (from-vib discount uses first active vib setup)
  const firstVibSetup=vibs.find(v=>v.on)?sectionSetup(vibs.find(v=>v.on),globalSetup):0;
  shocks.filter(s=>s.on).forEach((s,idx)=>{
    currentUnit=idx;
    const pre=idx>0?" #"+(idx+1)+(s.identifier?" ("+s.identifier+")":""):"";
    const pm=s.pia||1;
    const isMW=s.cat==="Medium Weight";
    const code=isMW?"91":"92";
    let su=sectionSetup(s,globalSetup);
    if(s.fromVib&&firstVibSetup>0)su=isMW?mwDisc(firstVibSetup):lwDisc(firstVibSetup);
    // Fixture Fabrication — first line for this test block
    if(s.fixtureFab?.on){
      const fabLabel="Fixture Fabrication – Shock"+(pre?pre:"");
      const laborAmt=r25(sf(s.fixtureFab.hours,0)*sf(s.fixtureFab.techRate,175));
      lines.push({label:fabLabel,val:laborAmt,code:code,unit:currentUnit,seq:seq++,isFabLine:true});
    }
    if(s.circ)add("Circulating System",2500,null,code);
    if(s.hydroPre)add("Shock"+pre+" – Pre-Test Hydrostatic",sf(s.hydroPrice||500),null,"95");
    const shockCat=isMW?"Medium Weight Shock":"Lightweight Shock";
    const shockSetupLabel=shockCat+pre+" – Setup"+(s.fromVib&&firstVibSetup>0?" (disc.)":"");
    const shockSetupDesc=s.fromVib&&firstVibSetup>0?"Pricing assumes the unit is coming directly from vibration testing.":null;
    if(s.showSetup!==false){const v=Math.round(sf(su*pm));if(v>0){const u=currentUnit;const sq=seq++;lines.push({label:shockSetupLabel,val:v,code:code,desc:shockSetupDesc,unit:u,seq:sq});}}
    // Shock instrumentation + HSV: between setup and testing
    if(inst.on){
      if(inst.items?.shock?.on)add("Shock Instrumentation",525*sf(inst.items.shock.channels,1),null,"33");
      if(inst.items?.cmShock?.on)add("Contact Monitoring (Shock)",350*sf(inst.items.cmShock.channels,1),null,"33");
      if(inst.items?.hsv?.on)add("High Speed Video",1950,null,"32");
    }
    add(shockCat+pre+" – Testing",sf(s.testing)*pm,null,code);
    if(s.hydroPost)add("Shock"+pre+" – Post-Test Hydrostatic",sf(s.hydroPrice||500),null,"95");
    (s.customRows||[]).forEach(r=>{if(sf(r.price)>0)add(r.label||"Custom",r.price,null,r.code||pcode(r.label||""));});
  });

  // Noise instances
  noises.filter(s=>s.on).forEach((s,idx)=>{
    currentUnit=idx;
    const pre=idx>0?" #"+(idx+1)+(s.identifier?" ("+s.identifier+")":""):"";
    const pm=s.pia||1;
    // Noise setup: chamber factor is the base; addlCosts from section can be added but NOT globalSetup fab/drill
    const noiseBase=sf(s.stdSetup,sf(NOISE_FAC[s.chamber],1000));
    const noiseSetup=Math.round(noiseBase+sf(s.addlCosts,0));
    if(s.showSetup!==false)add("Noise"+pre+" – Setup",noiseSetup*pm,null,"11");
    add("Noise"+pre+" – Testing",sf(s.testing)*pm,null,"11");
    (s.customRows||[]).forEach(r=>{if(sf(r.price)>0)add(r.label||"Custom",r.price,null,r.code||pcode(r.label||""));});
  });

  // ENV instances
  envs.filter(s=>s.on).forEach((s,idx)=>{
    currentUnit=idx;
    const pre=s.identifier?" ("+s.identifier+")":"";
    // Use T&H type in label
    const thTypeLabel={"Temperature & Humidity":"Temp & Humidity","Temperature Only":"Temperature","Humidity Only":"Humidity"};
    const LBL={th:thTypeLabel[s.thType]||"T&H",sf:"Salt Fog",alt:"Altitude",ess:"ESS",acc:"Acceleration",incl:"Inclination",rd:"Rapid Decomp.",ed:"Explosive Decomp.",drip:"Drip Test",sub:"Submergence",spray:"Spray Test",insres:"Insulation Resistance & Dielectric Strength"};
    const ENV_CODE={th:"53",sf:"55",alt:"56",ess:"54",acc:"57",incl:"93",rd:"56",ed:"56",drip:"58",sub:"58",spray:"58",insres:"59"};
    Object.entries(s.items||{}).forEach(([k,v])=>{
      if(!v?.on)return;
      const lbl=(LBL[k]||k)+pre;
      const code=ENV_CODE[k]||"";
      const testing=k==="th"?(ENV_TH_PRICES[s.thDur]||sf(v.testing,1000)):sf(v.testing);
      const setupAmt=sf(v.setup,0);
      if(setupAmt>0&&s.showSetup!==false)add(lbl+" – Setup",setupAmt,null,code);
      if(testing>0)add(lbl+" – Testing",testing,null,code);
    });
  });

  // HFV instances
  hfvs.filter(s=>s.on).forEach((s,idx)=>{
    currentUnit=idx;
    const pre=idx>0?" #"+(idx+1)+(s.identifier?" ("+s.identifier+")":""):"";
    const pm=s.pia||1;
    const hfvStd = sf(s.stdSetup||s.setup||"500", 500);
    const hfvDrill = sf(globalSetup?.holes,0)*0.5*sf(globalSetup?.techRate,175)*(globalSetup?.drillTap?1.5:1);
    const hfvFab = sf(globalSetup?.fabHours,0)*sf(globalSetup?.techRate,175);
    const hfvAddl = sf(s.addlCosts,0);
    const hfvSetupRaw = Math.round((hfvStd+hfvDrill+hfvFab+hfvAddl)*pm);
    const hfvSetupVal = isNaN(hfvSetupRaw)||hfvSetupRaw<=0 ? Math.round(hfvStd*pm)||500 : hfvSetupRaw;
    // Force push setup line directly — bypasses add()'s v>0 guard in case of edge cases
    if(s.showSetup!==false)lines.push({label:"HF Vibration"+pre+" – Setup",val:r25(hfvSetupVal),code:"52",unit:currentUnit,seq:seq++});
    add("HF Vibration"+pre+" – Testing",sf(s.testing)*pm,null,"52");
  });

  // SHO instances
  const hfvOn=hfvs.some(s=>s.on);
  shos.filter(s=>s.on).forEach((s,idx)=>{
    currentUnit=idx;
    const pre=idx>0?" #"+(idx+1)+(s.identifier?" ("+s.identifier+")":""):"";
    const pm=s.pia||1;
    const baseSetup=sectionSetup(s,globalSetup); const shoSetup=hfvOn?Math.ceil(baseSetup*0.75/25)*25:baseSetup;
    if(s.showSetup!==false)add("Shock (Other)"+pre+" – Setup"+(hfvOn?" (HFV disc.)":""),shoSetup*pm,null,"52");
    add("Shock (Other)"+pre+" – Testing",sf(s.testing)*pm,null,"52");
    (s.customRows||[]).forEach(r=>{if(sf(r.price)>0)add(r.label||"Custom",r.price,null,r.code||pcode(r.label||""));});
  });

  // EMI instances
  emis.filter(s=>s.on).forEach((s,idx)=>{
    currentUnit=idx;
    const pre=idx>0?" #"+(idx+1)+(s.identifier?" ("+s.identifier+")":""):"";
    const r=sf(s.rate,EMI_SR),pm=s.pia||1;
    // Use auto-calculated shifts from unit details
    // Use ti dims as fallback if emi instance has no manual dims set
    const emiForCalc={...s,dimL:s.dimL||"0",dimW:s.dimW||"0",dimH:s.dimH||"0",setupCables:globalSetup?.cables||"0"};
    const emiShifts=calcEmiShifts(emiForCalc);
    const selectedTests=Object.entries(s.tests||{}).filter(([,v])=>v).map(([k])=>k);
    const testShifts=selectedTests.reduce((a,t)=>a+(emiShifts[t]?.rounded||0),0);
    const rs103AmpCost=selectedTests.includes("RS103")?sf(s.rs103amp,5000):0;
    add("EMI"+pre+" – Setup",sf(s.setupShifts,3)*r*pm,null,"51");
    if(testShifts>0)add("EMI"+pre+" – Testing",(testShifts*r+rs103AmpCost)*pm,null,"51");
    add("EMI"+pre+" – Teardown",sf(s.tdShifts,1)*r,null,"51");
    if(sf(s.addl)>0)add("EMI"+pre+" – Addl Costs",s.addl,null,"51");
    (s.customRows||[]).forEach(r=>{if(sf(r.price)>0)add(r.label||"Custom",r.price,null,r.code||pcode(r.label||""));});
  });

  // PQ instances
  pqs.filter(s=>s.on).forEach((s,idx)=>{
    currentUnit=idx;
    const pre=idx>0?" #"+(idx+1)+(s.identifier?" ("+s.identifier+")":""):"";
    const r=sf(s.rate,PQ_SR),pm=s.pia||1;
    const is3ph=sf(s.phases||3,3)>=3;
    const PQ_ALL_SH={"5.3.1":0.5,"5.3.2":1.0,"5.3.3":1.0,"5.3.4":1.0,"5.3.5":is3ph?2.0:1.5,"5.3.6":2.0,"5.3.7":is3ph?1.0:0.75,"5.3.8":2.0,"5.3.9":0.75,"5.3.10.1":0.5,"5.3.10.2":0.5,
      "B5.3.1":1.0,"B5.3.2":1.0,"B5.3.3":is3ph?2.0:1.5,"B5.3.4":2.0,"B5.3.5":0.5,"B5.3.6":1.0,"B5.3.7":is3ph?1.0:0.75,"B5.3.8":2.0,"B5.3.9":0.75,"B5.3.10.1":0.5,"B5.3.10.2":0.5};
    const ts=Object.entries(s.rows||{}).reduce((a,[k,v])=>v?a+(PQ_ALL_SH[k]||0):a,0);
    add("PQ"+pre+" – Setup",sf(s.setupShifts,1.5)*r*pm,null,"51");
    add("PQ"+pre+" – Testing",ts*r*pm,null,"51");
    add("PQ"+pre+" – Teardown",sf(s.tdShifts,1.0)*r,null,"51");
    (s.customRows||[]).forEach(r=>{if(sf(r.price)>0)add(r.label||"Custom",r.price,null,r.code||pcode(r.label||""));});
  });

  // DCM instances
  dcms.filter(s=>s.on).forEach((s,idx)=>{
    currentUnit=idx;
    const pre=idx>0?" #"+(idx+1)+(s.identifier?" ("+s.identifier+")":""):"";
    const r=sf(s.rate,DCM_SR),pm=s.pia||1;
    add("DCM"+pre+" – Setup",sf(s.setupShifts,1.5)*r*pm,null,"51");
    add("DCM"+pre+" – Testing",sf(s.testShifts,1.0)*r*pm,null,"51");
    (s.customRows||[]).forEach(r=>{if(sf(r.price)>0)add(r.label||"Custom",r.price,null,r.code||pcode(r.label||""));});
  });

  // AB/SB instances
  abs.filter(s=>s.on).forEach((s,idx)=>{
    currentUnit=idx;
    const pre=idx>0?" #"+(idx+1)+(s.identifier?" ("+s.identifier+")":""):"";
    if(s.showSetup!==false)add("Airborne Noise"+pre+" – Setup",sectionSetup(s,globalSetup),null,"12");
    add("Airborne Noise"+pre+" – Testing",sf(s.testing),null,"12");
    (s.customRows||[]).forEach(r=>{if(sf(r.price)>0)add(r.label||"Custom",r.price,null,r.code||pcode(r.label||""));});
  });
  sbs.filter(s=>s.on).forEach((s,idx)=>{
    currentUnit=idx;
    const pre=idx>0?" #"+(idx+1)+(s.identifier?" ("+s.identifier+")":""):"";
    if(s.showSetup!==false)add("Structureborne Noise"+pre+" – Setup",sectionSetup(s,globalSetup),null,"12");
    add("Structureborne Noise"+pre+" – Testing",sf(s.testing),null,"12");
    (s.customRows||[]).forEach(r=>{if(sf(r.price)>0)add(r.label||"Custom",r.price,null,r.code||pcode(r.label||""));});
  });

  // Instrumentation — non-shock/vib items not already placed inline
  if(inst.on){
    // Items handled inline within vib/shock loops — only add here if no active vib/shock
    const hasActiveVib=vibs.some(s=>s.on);
    const hasActiveShock=shocks.some(s=>s.on);
    const INLINE=new Set(["shock","cmShock","vib","cmVib","hsv"]);
    const PRICES={shock:525,cmShock:350,vib:325,cmVib:750,hsv:1950,addl:1200};
    const LABELS={shock:"Shock Instrumentation",cmShock:"Contact Monitoring (Shock)",
      vib:"Vib Instrumentation",cmVib:"Contact Monitoring (Vibe)",hsv:"High Speed Video"};
    const CODES={shock:"33",cmShock:"33",vib:"33",cmVib:"33",hsv:"32"};
    Object.entries(inst.items||{}).forEach(([k,v])=>{
      if(!v?.on)return;
      // Skip inline items if their parent test section is active (already added inline)
      if(INLINE.has(k)){
        if(k==="vib"||k==="cmVib"){if(hasActiveVib)return;}
        else if(k==="shock"||k==="cmShock"||k==="hsv"){if(hasActiveShock)return;}
      }
      const price=PRICES[k]||0;
      const label=LABELS[k]||k;
      const code=CODES[k]||"33";
      if(price>0)add(label,price*sf(v.channels,1),null,code);
    });
  }

  const anyMain=vibs.some(s=>s.on)||shocks.some(s=>s.on)||noises.some(s=>s.on)||
    envs.some(s=>s.on)||hfvs.some(s=>s.on)||shos.some(s=>s.on)||
    emis.some(s=>s.on)||pqs.some(s=>s.on)||dcms.some(s=>s.on);
  if(anyMain){
    const hasMW=shocks.some(s=>s.on&&s.cat==="Medium Weight");
    const hasLW=shocks.some(s=>s.on&&s.cat==="Lightweight");
    const hasVib=vibs.some(s=>s.on);
    const hasNoise=noises.some(s=>s.on);
    const hasAb=abs.some(s=>s.on)||sbs.some(s=>s.on);
    const hasEnvOnly=envs.some(s=>s.on)&&!hasMW&&!hasLW&&!hasVib&&!hasNoise&&!hasAb;
    const SIMPLE_ENV=["th","sf","alt","insres"];
    const onlySimpleEnv=hasEnvOnly&&envs.every(s=>!s.on||Object.keys(s.items||{}).filter(k=>s.items[k]?.on).every(k=>SIMPLE_ENV.includes(k)));
    // totalSetup: vib + shock + noise + ab + sb setups (matching desktop)
    const totalSetup=
      vibs.filter(s=>s.on).reduce((a,s)=>a+sectionSetup(s,globalSetup),0)+
      shocks.filter(s=>s.on).reduce((a,s)=>a+(s.fromVib?
        (s.cat==="Medium Weight"?mwDisc(sectionSetup(vibs.find(v=>v.on)||{std:1000},globalSetup)):lwDisc(sectionSetup(vibs.find(v=>v.on)||{std:1000},globalSetup)))
        :sectionSetup(s,globalSetup)),0)+
      noises.filter(s=>s.on).reduce((a,s)=>a+sectionSetup(s,globalSetup),0)+
      abs.filter(s=>s.on).reduce((a,s)=>a+sectionSetup(s,globalSetup),0)+
      sbs.filter(s=>s.on).reduce((a,s)=>a+sectionSetup(s,globalSetup),0);
    // Teardown rules:
    // Base:       Vib=$750, LW shock only=$500, MW shock only=$750
    // Vib+MW:     $1000
    // Each of: Noise, AB/SB, complex Env, HFV/SHO adds $250, capped at $1500
    // Simple env only (T&H/SF/Alt): $500 flat
    // Skip if ONLY EMI/PQ/DCM (they include their own teardown shifts)
    const onlyShiftTests=!hasMW&&!hasLW&&!hasVib&&!hasNoise&&!hasAb&&
      !envs.some(s=>s.on)&&!hfvs.some(s=>s.on)&&!shos.some(s=>s.on)&&
      (emis.some(s=>s.on)||pqs.some(s=>s.on)||dcms.some(s=>s.on));
    if(!onlyShiftTests){
      let autoTd=0;
      if(onlySimpleEnv){
        autoTd=500;
      } else {
        // Base value from primary test type
        const hasHfv=hfvs.some(s=>s.on);
        const hasSho=shos.some(s=>s.on);
        if(hasVib && hasMW)       autoTd=1000;
        else if(hasVib)           autoTd=750;
        else if(hasMW)            autoTd=1000;
        else if(hasLW)            autoTd=500;
        else if(hasAb)            autoTd=750;
        else if(hasHfv||hasSho)   autoTd=500;
        // Additive bumps (each +$250, capped at $1500)
        if(hasNoise)                                      autoTd=Math.min(autoTd+250,1500);
        if(hasAb && (hasVib||hasMW||hasLW||hasNoise))     autoTd=Math.min(autoTd+250,1500);
        const hasComplexEnv=envs.some(s=>s.on)&&!onlySimpleEnv;
        if(hasComplexEnv)                                 autoTd=Math.min(autoTd+250,1500);
        if((hasHfv||hasSho) && (hasVib||hasMW||hasLW||hasNoise||hasAb)) autoTd=Math.min(autoTd+250,1500);
        if(autoTd===0) autoTd=500; // fallback for anything not covered
      }
      autoTd=Math.max(Math.min(autoTd,1500),500); // never less than 500
      const tdVal=sf(td)>0?sf(td):autoTd;
      add("Tear Down",tdVal,null,"96");
    }
  }

  // Subcontracting — added before budget so rollInto can target sub lines
  if(sub.on)sub.rows.forEach(r=>{if(sf(r.price)>0)add(r.desc||"Subcontract Item",r.price,null,"98");});

  // Budget materials: add marked-up total to the selected setup line
  if(ot.on)ot.rows.forEach(r=>{
    const b=r.type==="Weekday"?300:825,h=r.type==="Weekday"?262.5:350;
    const total=b+sf(r.techs,1)*sf(r.hours,0)*h;
    if(total>0)add(r.label||"Overtime",total,null,r.pcode||"94");
  });
  if(custom.on)custom.rows.forEach(r=>{if(r.label||String(r.price).trim())addUser(r.label||"Custom Item",r.price,null,r.pcode||"94");});

  // Budget - tracking only, does not add a line item to quote summary

  // Combined proc/report across all instances of all sections
  // Section proc/report prices — keyed by section type
  const PROC_PRICES={vib:PROC_BASE,shock:PROC_BASE,noise:PROC_BASE,env:PROC_BASE,hfv:PROC_BASE,sho:PROC_BASE,
    dcm:1950,pq:2925,emi:3425,ab:PROC_BASE,sb:PROC_BASE};
  const REP_PRICES={vib:REPORT_BASE,shock:REPORT_BASE,noise:REPORT_BASE,env:REPORT_BASE,hfv:REPORT_BASE,sho:REPORT_BASE,
    dcm:1500,pq:2450,emi:2850,ab:REPORT_BASE,sb:REPORT_BASE};
  const allSections=[
    ...vibs.filter(s=>s.on).map((s,i)=>({s,lbl:"Vibration"+(i>0?" #"+(i+1)+(s.identifier?" ("+s.identifier+")":""):""),type:"vib",unit:i})),
    ...shocks.filter(s=>s.on).map((s,i)=>({s,lbl:"Shock"+(i>0?" #"+(i+1)+(s.identifier?" ("+s.identifier+")":""):""),type:"shock",unit:i})),
    ...noises.filter(s=>s.on).map((s,i)=>({s,lbl:"Noise"+(i>0?" #"+(i+1)+(s.identifier?" ("+s.identifier+")":""):""),type:"noise",unit:i})),
    ...envs.filter(s=>s.on).map((s,i)=>({s,lbl:"Env"+(s.identifier?" ("+s.identifier+")":""),type:"env",unit:i})),
    ...hfvs.filter(s=>s.on).map((s,i)=>({s,lbl:"HF Vibration"+(i>0?" #"+(i+1)+(s.identifier?" ("+s.identifier+")":""):""),type:"hfv",unit:i})),
    ...shos.filter(s=>s.on).map((s,i)=>({s,lbl:"Shock (Other)"+(i>0?" #"+(i+1)+(s.identifier?" ("+s.identifier+")":""):""),type:"sho",unit:i})),
    ...dcms.filter(s=>s.on).map((s,i)=>({s,lbl:"DCM"+(i>0?" #"+(i+1)+(s.identifier?" ("+s.identifier+")":""):""),type:"dcm",unit:i})),
    ...pqs.filter(s=>s.on).map((s,i)=>({s,lbl:"PQ"+(i>0?" #"+(i+1)+(s.identifier?" ("+s.identifier+")":""):""),type:"pq",unit:i})),
    ...emis.filter(s=>s.on).map((s,i)=>({s,lbl:"EMI"+(i>0?" #"+(i+1)+(s.identifier?" ("+s.identifier+")":""):""),type:"emi",unit:i})),
    ...abs.filter(s=>s.on).map((s,i)=>({s,lbl:"Airborne Noise"+(i>0?" #"+(i+1)+(s.identifier?" ("+s.identifier+")":""):""),type:"ab",unit:i})),
    ...sbs.filter(s=>s.on).map((s,i)=>({s,lbl:"Structureborne Noise"+(i>0?" #"+(i+1)+(s.identifier?" ("+s.identifier+")":""):""),type:"sb",unit:i})),
  ];
  const procSecs=allSections.filter(({s})=>s.proc);
  const repSecs=allSections.filter(({s})=>s.report);

  // Get unique unit indices that have any procs/reports
  const procUnits=[...new Set(procSecs.map(x=>x.unit))].sort((a,b)=>a-b);
  const repUnits=[...new Set(repSecs.map(x=>x.unit))].sort((a,b)=>a-b);

  const addProcRepForUnit=(sections,type,unitIdx)=>{
    // type: 'proc' or 'rep'
    const unitSecs=sections.filter(x=>x.unit===unitIdx);
    if(unitSecs.length===0)return;
    const PRICES=type==='proc'?PROC_PRICES:REP_PRICES;
    const baseCode=type==='proc'?'42':'41';
    const specialCode=type==='proc'?'44':'43';
    const isUnit1=unitIdx===0;
    const unitLabel=unitIdx>0?" (Unit "+(unitIdx+1)+")":"";

    if(splitProcReport){
      unitSecs.forEach(({lbl,type:t})=>{
        const price=PRICES[t]||(type==='proc'?PROC_BASE:REPORT_BASE);
        const code=(t==="emi"||t==="dcm"||t==="pq")?specialCode:baseCode;
        const lineLabel=lbl+(type==='proc'?" – Test Procedure":" – Test Report");
        currentUnit=unitIdx; add(lineLabel,price,null,code);
      });
    } else {
      if(unitSecs.length===1){
        const {lbl,type:t}=unitSecs[0];
        const price=PRICES[t]||(type==='proc'?PROC_BASE:REPORT_BASE);
        const code=(t==="emi"||t==="dcm"||t==="pq")?specialCode:baseCode;
        const lineLabel=lbl+(type==='proc'?" – Test Procedure":" – Test Report");
        currentUnit=unitIdx; add(lineLabel,price,null,code);
      } else {
        const maxPrice=Math.max(...unitSecs.map(({type:t})=>PRICES[t]||(type==='proc'?PROC_BASE:REPORT_BASE)));
        const combined=Math.round((maxPrice+maxPrice*0.075*(unitSecs.length-1))/25)*25;
        const hasSpecial=unitSecs.some(({type:t})=>t==="emi"||t==="dcm"||t==="pq");
        const lineLabel=(isUnit1?"Combined ":"Combined ")+(type==='proc'?"Test Procedure":"Test Report")+unitLabel;
        currentUnit=unitIdx; add(lineLabel,combined,null,hasSpecial?specialCode:baseCode);
      }
    }
  };

  procUnits.forEach(u=>addProcRepForUnit(procSecs,'proc',u));
  repUnits.forEach(u=>addProcRepForUnit(repSecs,'rep',u));

  // Global proc/report/coc rows — procs go to procLines, reps/coc go to repLines via their codes
  (globalPR?.procs||[]).forEach(r=>{if(sf(r.price)>0)add(r.label||"Test Procedure",r.price,null,r.code||"42");});
  (globalPR?.reps||[]).forEach(r=>{if(sf(r.price)>0)add(r.label||"Test Report",r.price,null,r.code||"41");});
  if(globalPR?.coc)add("Certificate of Compliance",globalPR.cocPrice||"250",null,"41");
  // Fixture Drawing (code 42, sorts before modal analysis and EMI/PQ/DCM procs)
  if(fixtureDrawing?.on)add("Fixture Drawings",fixtureDrawing.price||"2950",null,"42");
  // Modal Analysis (code 67, sorts after fixture drawing, before EMI/PQ/DCM procs)
  if(modalAnalysis?.on){
    // If in-stock modal applies to a proc line, bump that proc's price to 3750
    // (handled by inStockModal state on the proc side — modal analysis itself is always added)
    add("Modal Analysis",modalAnalysis.price||"6750",null,"67");
  }
  // Sort: procs first, then test lines grouped by unit, then reports last
  const procLines=lines.filter(l=>l.code==="42"||l.code==="44"||l.label.toLowerCase().includes("procedure"));
  const repLines=lines.filter(l=>l.code==="41"||l.code==="43"||l.label.toLowerCase().includes("test report")||l.label.toLowerCase().includes("combined test report"));
  const mainLines=lines.filter(l=>!procLines.includes(l)&&!repLines.includes(l)&&l.code!=="67");

  // Separate Tear Down from mainLines — it needs special placement
  const tdLine=mainLines.find(l=>l.label==="Tear Down");
  const mainNoTd=mainLines.filter(l=>l.label!=="Tear Down");

  // Split mainLines into mechanical (vib/shock/noise/env/hfv/sho/ab/sb/inst) vs shift-based (emi/pq/dcm)
  const SHIFT_CODES=new Set(["51"]);
  const mechLines=mainNoTd.filter(l=>!SHIFT_CODES.has(l.code));
  const shiftLines=mainNoTd.filter(l=>SHIFT_CODES.has(l.code));

  // Sort by seq — calcSummary inserts lines in correct display order
  mechLines.sort((a,b)=>(a.seq||0)-(b.seq||0));
  shiftLines.sort((a,b)=>(a.seq||0)-(b.seq||0));

  // Tear Down goes after all mechanical lines, before shift-based lines
  const sortedMain=[...mechLines,...(tdLine?[tdLine]:[]),...shiftLines];
  // Proc order: general procs (42) first, then EMI (44), then DCM (44), then PQ (44)
  // Fixture drawings and modal analysis use codes 42 and 67 — sort them between regular procs and EMI/PQ/DCM
  const allProcAndSpecial=[...procLines,...lines.filter(l=>l.code==="67")];
  const sortedProcs=allProcAndSpecial.sort((a,b)=>{
    const order=l=>{
      if(l.label.toLowerCase().includes("fixture drawing"))return 1;
      if(l.code==="67"||l.label.toLowerCase().includes("modal analysis"))return 2;
      if(l.label.toLowerCase().includes("emi"))return 3;
      if(l.label.toLowerCase().includes("dc mag")||l.label.toLowerCase().includes("dcm"))return 4;
      if(l.label.toLowerCase().includes("pq")||l.label.toLowerCase().includes("power quality"))return 5;
      return 0;
    };
    return order(a)-order(b);
  });
  // Report order: general (41) first, then EMI (43), then DCM, then PQ
  const sortedReps=repLines.sort((a,b)=>{
    const order=l=>{
      if(l.label.toLowerCase().includes("emi"))return 2;
      if(l.label.toLowerCase().includes("dc mag")||l.label.toLowerCase().includes("dcm"))return 3;
      if(l.label.toLowerCase().includes("pq")||l.label.toLowerCase().includes("power quality"))return 4;
      return 1;
    };
    return order(a)-order(b);
  });
  const sorted=[...sortedProcs,...sortedMain,...sortedReps].filter(l=>l.val>0||l.userDefined);
  // Apply in-stock modal analysis price override to the targeted procedure line
  if(inStockModal?.on&&inStockModal.targetProc){
    const target=sorted.find(l=>l.label===inStockModal.targetProc);
    if(target){target.val=3750;target.display="$3,750";}
  }
  const setupLineLabels=sorted.filter(l=>l.label.toLowerCase().includes("setup")).map(l=>l.label);
  return{lines:sorted,total:sorted.reduce((s,l)=>s+l.val,0),setupLineLabels};
}

// ── Combine manual + auto-generated specs (append new lines, don't replace) ──
function combineSpecs(manual, auto){
  const m=(manual||"").trim();
  const a=(auto||"").trim();
  if(!m)return a;
  if(!a)return m;
  const newLines=a.split("\n\n").filter(line=>!m.includes(line.trim()));
  return newLines.length?m+"\n\n"+newLines.join("\n\n"):m;
}

// ── Auto-specs helper ─────────────────────────────────────────────────────────
function buildSpecs(vibs,shocks,noises,envs,hfvs,shos,dcms,emis,pqs,abs,sbs){
  const lines=[];
  const sc=spec=>spec?" in accordance with "+spec:"";
  vibs.filter(s=>s.on&&s.spec).forEach((s,i)=>{
    const fp=s.freqRange?", "+s.freqRange+" Hz":"";
    const pre=i>0?" #"+(i+1)+(s.identifier?" ("+s.identifier+")":""):"";
    lines.push("Type I Vibration"+pre+sc(s.spec)+fp+".");
  });
  shocks.filter(s=>s.on&&s.spec).forEach((s,i)=>{
    const parts=[];
    if(s.grade)parts.push("Grade "+s.grade);
    if(s.class_)parts.push("Class "+s.class_);
    if(s.type_)parts.push("Type "+s.type_);
    // Location — append "Mounted" for all options
    const loc=s.location||"Hull";
    const locStr=loc+" Mounted";
    if(s.submarine)parts.push("Submarine");
    parts.push(locStr);
    const orientStr=s.orientation&&s.orientation!=="Unrestricted"?s.orientation+" Orientation":"Unrestricted Orientation";
    parts.push(orientStr);
    if(s.blows)parts.push(s.blows+" blows");
    const det=parts.length?", "+parts.join(", "):"";
    const pre=i>0?" #"+(i+1)+(s.identifier?" ("+s.identifier+")":""):"";
    lines.push(s.cat+" Shock"+pre+sc(s.spec)+det+".");
  });
  noises.filter(s=>s.on).forEach((s,i)=>{
    const oasp=s.oaspl?", "+s.oaspl+" OASPL":"";
    const dur=s.durVal?" for "+s.durVal+" "+s.durUnit:"";
    const pre=i>0?" #"+(i+1)+(s.identifier?" ("+s.identifier+")":""):"";
    lines.push("Noise Susceptibility"+pre+sc(s.spec)+oasp+dur+".");
  });
  envs.filter(s=>s.on).forEach((s,i)=>{
    const pre=s.identifier?" ("+s.identifier+")":"";
    const thMap={"Temperature & Humidity":"Temperature & Humidity","Temperature Only":"Temperature","Humidity Only":"Humidity"};
    const it=s.items||{};
    if(it.th?.on){const t=thMap[s.thType]||s.thType;const customDur=s.thDurVal?(s.thDurVal+" "+(s.thDurUnit||"hours")):s.thDur?s.thDur:"";const dur=customDur?", "+customDur:"";lines.push(t+" testing"+pre+sc(it.th.spec||s.spec)+dur+".");}
    if(it.sf?.on)lines.push("Salt Fog testing"+pre+sc(it.sf.spec||s.spec)+".");
    if(it.alt?.on){const dw=s.altDwell?", "+s.altDwell+" dwell":"";lines.push("Altitude testing"+pre+sc(it.alt.spec||s.spec)+dw+".");}
    if(it.ess?.on){const dur=s.essDur||"10 minutes";lines.push("ESS testing"+pre+sc(it.ess.spec||s.spec)+", "+dur+" per axis.");}
    if(it.acc?.on)lines.push("Acceleration testing"+pre+sc(it.acc.spec||s.spec)+".");
    if(it.incl?.on)lines.push("Inclination testing"+pre+sc(it.incl.spec||s.spec)+".");
    if(it.rd?.on)lines.push("Rapid Decompression testing"+pre+sc(it.rd.spec||s.spec)+".");
    if(it.ed?.on)lines.push("Explosive Decompression testing"+pre+sc(it.ed.spec||s.spec)+".");
    if(it.drip?.on)lines.push("Drip Test"+pre+sc(it.drip.spec||s.spec)+".");
    if(it.sub?.on)lines.push("Submergence testing"+pre+sc(it.sub.spec||s.spec)+".");
    if(it.spray?.on)lines.push("Spray Test"+pre+sc(it.spray.spec||s.spec)+".");
  });
  hfvs.filter(s=>s.on&&s.spec).forEach((s,i)=>{
    const pre=i>0?" #"+(i+1)+(s.identifier?" ("+s.identifier+")":""):"";
    lines.push("Vibration testing"+pre+sc(s.spec)+", tested for "+(s.dur||"30")+" minutes per axis.");
  });
  shos.filter(s=>s.on&&s.spec).forEach((s,i)=>{
    const pre=i>0?" #"+(i+1)+(s.identifier?" ("+s.identifier+")":""):"";
    if((s.shape==="Half Sine"||s.shape==="Sawtooth")&&(s.nPulses||s.gLevel||s.pDur)){
      const pulseDetails=[
        s.nPulses?"Perform "+s.nPulses:"",
        s.gLevel?s.gLevel+"g":"",
        s.pDur?s.pDur+"ms shock pulses":"",
      ].filter(Boolean).join(", ");
      lines.push("Shock testing"+pre+" in accordance with "+s.spec+". "+pulseDetails+".");
    } else if(s.shape==="Drop Shock"){
      lines.push("Drop Shock testing"+pre+" in accordance with "+s.spec+".");
    } else if(s.shape==="Bench Handling"){
      lines.push("Bench Handling Shock testing"+pre+" in accordance with "+s.spec+".");
    } else {
      lines.push("Shock testing"+pre+sc(s.spec)+".");
    }
  });
  dcms.filter(s=>s.on&&s.spec).forEach((s,i)=>{
    const pre=i>0?" #"+(i+1)+(s.identifier?" ("+s.identifier+")":""):"";
    lines.push("DC Magnetics"+pre+" in accordance with "+s.spec+".");
  });
  emis.filter(s=>s.on).forEach((s,i)=>{
    const pre=i>0?" #"+(i+1)+(s.identifier?" ("+s.identifier+")":""):"";
    const selectedRev=Object.entries(s.revs||{}).filter(([,v])=>v).map(([k])=>k.replace("Rev ",""))[0]||"";
    const specStr=s.spec?s.spec:("MIL-STD-461"+selectedRev);
    if(!specStr)return;
    const plats=Object.entries(s.plats||{}).filter(([,v])=>v).map(([k])=>k.toLowerCase());
    const locs=Object.entries(s.locs||{}).filter(([,v])=>v).map(([k])=>k.toLowerCase()+" applications");
    const parts=[specStr,...plats,...locs];
    lines.push("EMI testing"+pre+" in accordance with "+parts.join(", ")+".");
  });
  pqs.filter(s=>s.on).forEach((s,i)=>{
    const pre=i>0?" #"+(i+1)+(s.identifier?" ("+s.identifier+")":""):"";
    const hasPart1=Object.entries(s.rows||{}).some(([k,v])=>v&&!k.includes("300b"));
    const has300b=Object.entries(s.rows||{}).some(([k,v])=>v&&k.includes("5.3.3"));
    if(hasPart1)lines.push("Power Quality testing"+pre+" in accordance with MIL-STD-1399, Section 300 Part 1.");
    if(has300b)lines.push("Power Quality testing"+pre+" in accordance with MIL-STD-1399, Section 300B.");
  });
  abs.filter(s=>s.on).forEach((s,i)=>{
    const pre=i>0?" #"+(i+1)+(s.identifier?" ("+s.identifier+")":""):"";
    const spec=s.spec||("MIL-STD-"+s.rev);
    lines.push("Airborne Noise testing"+pre+" in accordance with "+spec+".");
  });
  sbs.filter(s=>s.on).forEach((s,i)=>{
    const pre=i>0?" #"+(i+1)+(s.identifier?" ("+s.identifier+")":""):"";
    const spec=s.spec||("MIL-STD-"+s.rev);
    lines.push("Structureborne Noise testing"+pre+" in accordance with "+spec+".");
  });
  return lines.join("\n\n");
}



// ── Account Dashboard Modal ───────────────────────────────────────────────────
function AccountDashboard({accountName, onClose, onLoadQuote, onNewQuote}){
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedYear, setExpandedYear] = useState(null);

  useEffect(()=>{
    if(!accountName)return;
    (async()=>{
      setLoading(true);
      // Fetch all quotes for this exact account name
      let allRows=[], from=0, batch=500;
      while(true){
        const {data:rows,error}=await supabase
          .from("quotes")
          .select("id, opportunity, revision, stage, total, won_date, data, source, created_at")
          .eq("customer", accountName)
          .order("opportunity", {ascending:false})
          .range(from, from+batch-1);
        if(error||!rows||rows.length===0)break;
        allRows=allRows.concat(rows);
        if(rows.length<batch)break;
        from+=batch;
      }

      // Group by year prefix from opportunity number
      const yearMap={};
      allRows.forEach(row=>{
        const opp=row.opportunity||"";
        const match=opp.match(/^(\d{2})-/);
        const yr=match?"20"+match[1]:"Unknown";
        if(!yearMap[yr])yearMap[yr]={year:yr,quotes:[],wonCount:0,wonTotal:0,total:0,count:0};
        const total=row.total||0;
        const isWon=row.stage==="Closed Won";
        const rev=row.data?.qi?.rev||row.revision||"";
        yearMap[yr].quotes.push({
          id:row.id,
          opp:opp,
          rev,
          stage:row.stage||"",
          total,
          data:row.data,
          source:row.source,
        });
        yearMap[yr].count++;
        yearMap[yr].total+=total;
        if(isWon){yearMap[yr].wonCount++;yearMap[yr].wonTotal+=total;}
      });

      // Sort years newest first, Unknown at bottom
      const years=Object.values(yearMap).sort((a,b)=>{
        if(a.year==="Unknown")return 1;
        if(b.year==="Unknown")return-1;
        return b.year.localeCompare(a.year);
      });

      const lifetimeCount=allRows.length;
      const lifetimeTotal=allRows.reduce((a,r)=>a+(r.total||0),0);
      const lifetimeWon=allRows.filter(r=>r.stage==="Closed Won").length;
      const winRate=lifetimeCount>0?Math.round((lifetimeWon/lifetimeCount)*100):0;

      setData({years, lifetimeCount, lifetimeTotal, lifetimeWon, winRate});
      setLoading(false);
    })();
  },[accountName]);

  const money=n=>"$"+Math.round(n).toLocaleString();
  const stageColor=s=>{
    if(!s)return"#9aa5b1";
    if(s.includes("Won"))return"#1e8449";
    if(s.includes("Lost")||s.includes("Cancelled"))return"#c0392b";
    if(s.includes("Pending")||s.includes("RFQ"))return"#b7791f";
    return"#6b7a8d";
  };

  return(
    <div style={{position:"fixed",inset:0,zIndex:4000,background:"rgba(0,0,0,0.5)",
      display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:48}}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:"#fff",borderRadius:14,width:780,maxWidth:"95vw",maxHeight:"85vh",
        boxShadow:"0 8px 40px rgba(0,0,0,0.3)",display:"flex",flexDirection:"column"}}>

        {/* Header */}
        <div style={{padding:"20px 28px",borderBottom:"1px solid #e8ecf0",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between"}}>
            <div>
              <div style={{fontSize:11,fontWeight:700,letterSpacing:1.5,color:"#9aa5b1",marginBottom:4}}>
                ACCOUNT DASHBOARD
              </div>
              <div style={{fontSize:20,fontWeight:800,color:"#1a2332"}}>{accountName}</div>
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <button
                onClick={()=>{onNewQuote&&onNewQuote(accountName);onClose();}}
                style={{background:"#1a5276",border:"none",borderRadius:7,padding:"7px 16px",
                  color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer",letterSpacing:.5}}>
                + New Quote
              </button>
              <button onClick={onClose}
                style={{background:"none",border:"none",fontSize:22,cursor:"pointer",color:"#6b7a8d",marginTop:-4}}>
                ×
              </button>
            </div>
          </div>
          {!loading&&data&&(
            <div style={{display:"flex",gap:28,marginTop:14,flexWrap:"wrap"}}>
              {[
                {label:"Total Quotes",val:data.lifetimeCount},
                {label:"Lifetime Value",val:money(data.lifetimeTotal)},
                {label:"Closed Won",val:data.lifetimeWon},
                {label:"Win Rate",val:data.winRate+"%"},
              ].map(({label,val})=>(
                <div key={label}>
                  <div style={{fontSize:9,fontWeight:700,letterSpacing:1,color:"#9aa5b1"}}>{label}</div>
                  <div style={{fontSize:18,fontWeight:800,color:"#1a2332",marginTop:2}}>{val}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Body */}
        <div style={{flex:1,overflowY:"auto",padding:"16px 28px"}}>
          {loading?(
            <div style={{textAlign:"center",padding:60,color:"#9aa5b1",fontSize:13}}>Loading…</div>
          ):!data||data.years.length===0?(
            <div style={{textAlign:"center",padding:60,color:"#9aa5b1",fontSize:13}}>No quotes found for this account</div>
          ):(
            <>
              {/* Column headers */}
              <div style={{display:"grid",gridTemplateColumns:"80px 1fr 1fr 1fr 1fr 60px",
                gap:8,padding:"6px 12px",
                fontSize:9,fontWeight:700,letterSpacing:.8,color:"#9aa5b1",marginBottom:4}}>
                <div>YEAR</div><div>QUOTES</div><div>TOTAL VALUE</div>
                <div>CLOSED WON</div><div>WON VALUE</div><div>WIN %</div>
              </div>
              {data.years.map(y=>{
                const winPct=y.count>0?Math.round((y.wonCount/y.count)*100):0;
                const isOpen=expandedYear===y.year;
                return(
                  <div key={y.year} style={{marginBottom:6}}>
                    {/* Year row */}
                    <div
                      onClick={()=>setExpandedYear(isOpen?null:y.year)}
                      style={{display:"grid",gridTemplateColumns:"80px 1fr 1fr 1fr 1fr 60px",
                        gap:8,padding:"10px 12px",borderRadius:8,cursor:"pointer",
                        background:isOpen?"#f0f4ff":"#f8f9fb",
                        border:"1px solid "+(isOpen?"#1a5276":"#e8ecf0"),
                        transition:"all .15s"}}>
                      <div style={{fontWeight:800,fontSize:14,color:y.year==="Unknown"?"#9aa5b1":"#1a2332"}}>
                        {y.year}
                      </div>
                      <div style={{fontSize:12,color:"#1a2332",fontWeight:600}}>{y.count}</div>
                      <div style={{fontSize:12,color:"#1a5276",fontWeight:600}}>{money(y.total)}</div>
                      <div style={{fontSize:12,color:"#1e8449",fontWeight:600}}>{y.wonCount}</div>
                      <div style={{fontSize:12,color:"#1e8449",fontWeight:600}}>{money(y.wonTotal)}</div>
                      <div style={{fontSize:12,color:winPct>=50?"#1e8449":"#6b7a8d",fontWeight:600,
                        display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                        {winPct}%
                        <span style={{fontSize:10,color:"#9aa5b1"}}>{isOpen?"▲":"▼"}</span>
                      </div>
                    </div>
                    {/* Expanded quote list */}
                    {isOpen&&(
                      <div style={{marginTop:4,marginLeft:12,borderLeft:"2px solid #1a5276",paddingLeft:12}}>
                        <div style={{display:"grid",gridTemplateColumns:"2fr 1.5fr 1fr",
                          gap:8,padding:"4px 8px",
                          fontSize:9,fontWeight:700,letterSpacing:.8,color:"#9aa5b1",marginBottom:2}}>
                          <div>OPPORTUNITY</div><div>STAGE</div><div style={{textAlign:"right"}}>TOTAL</div>
                        </div>
                        {y.quotes.map(q=>(
                          <div key={q.id}
                            onClick={()=>{
                              const blob=q.data||{};
                              onLoadQuote({
                                ...blob,
                                id:q.id,
                                opp:q.opp||blob.opp,
                                rev:q.rev||blob.qi?.rev||"",
                                customer:accountName,
                                total:q.total||blob.total,
                                source:blob.source||q.source||"vibrato",
                              });
                              onClose();
                            }}
                            style={{display:"grid",gridTemplateColumns:"2fr 1.5fr 1fr",
                              gap:8,padding:"7px 8px",borderRadius:6,cursor:"pointer",
                              borderBottom:"1px solid #f0f2f5",transition:"background .1s"}}
                            onMouseEnter={e=>e.currentTarget.style.background="#f0f4ff"}
                            onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                            <div style={{fontWeight:600,fontSize:12,color:"#1a5276",
                              textDecoration:"underline",textDecorationColor:"rgba(26,82,118,0.3)"}}>
                              {q.opp||"—"}
                            </div>
                            <div style={{fontSize:11,fontWeight:600,color:stageColor(q.stage)}}>
                              {q.stage||"—"}
                            </div>
                            <div style={{fontSize:11,fontWeight:600,color:"#1a2332",textAlign:"right"}}>
                              {money(q.total||0)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function Dashboard({onEnterQuote, onLoadQuote, onNewQuoteForAccount, currentUser, isApprover, isFollowUpUser, pendingQuotes, onQueueDecision, needsRefresh, onRefreshComplete}){
  const [data, setData]       = useState(null);
  const [qSelected, setQSelected] = useState(new Set());
  const [qComments, setQComments] = useState("");
  const [acctSearch, setAcctSearch]   = useState("");
  const [acctResults, setAcctResults] = useState([]);
  const [acctOpen, setAcctOpen]       = useState(false);
  const [acctModal, setAcctModal]     = useState(null); // account name string
  const acctRef  = useRef(null);
  const acctTimer = useRef(null);

  // Debounced account search against distinct customer values in quotes table
  useEffect(()=>{
    clearTimeout(acctTimer.current);
    if(!acctSearch.trim()){setAcctResults([]);setAcctOpen(false);return;}
    acctTimer.current=setTimeout(async()=>{
      const {data:rows}=await supabase
        .from("quotes")
        .select("customer")
        .ilike("customer",`%${acctSearch.trim()}%`)
        .limit(200);
      // Deduplicate
      const seen=new Set();
      const unique=(rows||[]).map(r=>r.customer).filter(n=>{
        if(!n||seen.has(n))return false;
        seen.add(n);return true;
      }).sort();
      setAcctResults(unique);
      setAcctOpen(unique.length>0);
    },250);
    return()=>clearTimeout(acctTimer.current);
  },[acctSearch]);

  // Close account dropdown on outside click
  useEffect(()=>{
    const h=e=>{if(acctRef.current&&!acctRef.current.contains(e.target))setAcctOpen(false);};
    document.addEventListener("mousedown",h);
    return()=>document.removeEventListener("mousedown",h);
  },[]);
  const [loading, setLoading] = useState(true);
  const [privacyMode, setPrivacyMode] = useState(false);
  const [showRecentApproved, setShowRecentApproved] = useState(false);
  const [recentApproved, setRecentApproved] = useState(null);
  const [recentApprovedLoading, setRecentApprovedLoading] = useState(false);
  const [recentDays, setRecentDays] = useState(7);
  const [showPrevMonth, setShowPrevMonth] = useState(false);
  const [prevMonthData, setPrevMonthData] = useState(null);
  const [prevMonthLoading, setPrevMonthLoading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(()=>{
    // Default to last completed month (never current or future)
    const d = new Date();
    const m = d.getMonth(); // 0-indexed current month
    return {
      month: m === 0 ? 11 : m - 1,
      year:  m === 0 ? d.getFullYear() - 1 : d.getFullYear()
    };
  });
  const [followUps, setFollowUps]   = useState([]);
  const [fuLoading, setFuLoading]   = useState(false);
  const [flaggedQuotes,setFlaggedQuotes]=useState([]);
  const [flagsLoading,setFlagsLoading]=useState(false);
  const [aiInput,setAiInput]=useState("");
  const [aiLoading,setAiLoading]=useState(false);
  const [aiMessages,setAiMessages]=useState([]);
  const [fuEmail, setFuEmail]       = useState(null);   // {quoteId, text} — generated email
  const [fuEmailLoading, setFuEmailLoading] = useState(null); // quoteId generating for

  const askAI = async (question) => {
    if(!question.trim()||aiLoading) return;
    const userMsg = {role:'user', content: question};
    setAiMessages(prev=>[...prev, userMsg]);
    setAiInput("");
    setAiLoading(true);
    try {
      // Fetch quotes — rich data for Claude to reason about
      const {data:quotes} = await supabase
        .from('quotes')
        .select('opportunity,customer,total,created_at,won_date,data')
        .order('created_at',{ascending:false})
        .limit(1000);

      const {data:followUpsData} = await supabase
        .from('follow_ups')
        .select('opportunity,customer,sent_at,followed_up,followup_again_at')
        .eq('followed_up',false)
        .limit(500);

      // Build compact but rich summary — enough for Claude to answer specific questions
      const quoteSummary = (quotes||[]).map(q=>{
        const d=q.data||{};
        const tests=[];
        if(d.vibs?.some(s=>s.on))tests.push('Vib');
        if(d.shocks?.some(s=>s.on))tests.push('Shock');
        if(d.noises?.some(s=>s.on))tests.push('Noise');
        if(d.envs?.some(s=>s.on))tests.push('Env');
        if(d.hfvs?.some(s=>s.on))tests.push('HFV');
        if(d.emis?.some(s=>s.on))tests.push('EMI');
        if(d.pqs?.some(s=>s.on))tests.push('PQ');
        if(d.dcms?.some(s=>s.on))tests.push('DCM');
        return {
          o:q.opportunity, c:q.customer, t:q.total,
          s:d.qi?.stage||'', dt:q.created_at?.slice(0,10),
          i:d.ti?.item||'', ct:d.qi?.contact||'',
          ts:tests.join(','),
        };
      });

      const today = new Date().toISOString().slice(0,10);
      // Abbreviated keys to save tokens: o=opp,c=customer,t=total,s=stage,dt=date,i=item,ct=contact,ts=tests
      const systemPrompt = `NU Labs sales assistant. Today:${today}. Answer concisely, bullet points for lists.\nQUOTES(${quoteSummary.length})[o=opp,c=customer,t=$total,s=stage,dt=date,i=item,ct=contact,ts=tests]:${JSON.stringify(quoteSummary)}\nFOLLOWUPS(${(followUpsData||[]).length})[o=opp,c=customer,s=sent,d=due]:${JSON.stringify((followUpsData||[]).map(f=>({o:f.opportunity,c:f.customer,s:f.sent_at?.slice(0,10),d:f.followup_again_at})))}`;

      const response = await fetch(
        'https://swuuxzmgmldvvomsgmjf.supabase.co/functions/v1/ai-analysis',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3dXV4em1nbWxkdnZvbXNnbWpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4MjcyMzMsImV4cCI6MjA4ODQwMzIzM30.GinbXqvBHcvYRaACBhgpd_Si8-qIDDj7PlbTCINcSU8',
          },
          body: JSON.stringify({
            system: systemPrompt,
            messages: [...aiMessages, userMsg].map(m=>({role:m.role,content:m.content})),
          })
        }
      );
      const data = await response.json();
      const answer = data.content?.[0]?.text || data.text || data.error || 'Sorry, I could not get a response.';
      setAiMessages(prev=>[...prev, {role:'assistant', content:answer}]);
    } catch(e) {
      setAiMessages(prev=>[...prev, {role:'assistant', content:'Error: '+e.message}]);
    }
    setAiLoading(false);
  };

  const loadFlags = async () => {
    setFlagsLoading(true);
    try {
      const {data,error}=await supabase
        .from("quote_flags")
        .select("id,quote_id,opportunity,customer,flagged_by,flagged_at,note")
        .eq("resolved",false)
        .order("flagged_at",{ascending:false});
      if(!error)setFlaggedQuotes(data||[]);
    } catch(e){ console.warn("quote_flags not yet available",e); }
    setFlagsLoading(false);
  };

  const loadFollowUps = async () => {
    if(!isFollowUpUser)return;
    setFuLoading(true);
    const thirtyDaysAgo = new Date(Date.now() - 30*24*60*60*1000).toISOString();
    const ninetyDaysAgo = new Date(Date.now() - 90*24*60*60*1000).toISOString();
    const today = new Date().toISOString().slice(0,10);
    // Get follow_ups that are either:
    //   a) sent 30+ days ago and not yet followed up
    //   b) have a followup_again_at date <= today and not yet followed up again
    const {data,error} = await supabase
      .from("follow_ups")
      .select("*, quotes(opportunity, customer, data)")
      .eq("followed_up", false)
      .or(`sent_at.lte.${thirtyDaysAgo},followup_again_at.lte.${today}`)
      .order("sent_at", {ascending: true});
    if(!error){
      // Filter out closed won/lost quotes
      const filtered=(data||[]).filter(fu=>{
        const stage=fu.quotes?.data?.qi?.stage||"" ;
        return stage!=="Closed Won"&&stage!=="Closed Lost";
      });
      setFollowUps(filtered);
    }
    setFuLoading(false);
  };

  const generateFollowUpEmail = async (fu) => {
    setFuEmailLoading(fu.id);
    const q = fu.quotes;
    const blob = q?.data || {};
    const tests = [];
    if(blob.vibs?.some(s=>s.on))tests.push("Vibration");
    if(blob.shocks?.some(s=>s.on))tests.push("Shock");
    if(blob.noises?.some(s=>s.on))tests.push("Acoustic Noise");
    if(blob.envs?.some(s=>s.on))tests.push("Environmental");
    if(blob.emis?.some(s=>s.on))tests.push("EMI/EMC");
    if(blob.pqs?.some(s=>s.on))tests.push("Power Quality");
    if(blob.hfvs?.some(s=>s.on))tests.push("High Frequency Vibration");
    const itemName = blob.ti?.item || blob.qi?.item || "";
    try {
      // Call via Supabase Edge Function to avoid CORS + keep API key server-side
      const resp = await fetch(
        "https://swuuxzmgmldvvomsgmjf.supabase.co/functions/v1/generate-followup-email",
        {
          method:"POST",
          headers:{
            "Content-Type":"application/json",
            "Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3dXV4em1nbWxkdnZvbXNnbWpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4MjcyMzMsImV4cCI6MjA4ODQwMzIzM30.GinbXqvBHcvYRaACBhgpd_Si8-qIDDj7PlbTCINcSU8",
          },
          body: JSON.stringify({
            opportunity: fu.opportunity || q?.opportunity || "",
            customer:    fu.customer    || q?.customer    || "",
            itemName,
            tests,
            sentBy: fu.sent_by || "NU Laboratories Sales",
          })
        }
      );
      const json = await resp.json();
      if(json.error) throw new Error(json.error);
      setFuEmail({id:fu.id, text: json.text || "Could not generate email."});
    } catch(e) {
      setFuEmail({id:fu.id, text:"Error generating email — please try again."});
    }
    setFuEmailLoading(null);
  };

  const markFollowedUp = async (fuId, scheduleAgain) => {
    const update = {
      followed_up: true,
      followed_up_at: new Date().toISOString(),
      followed_up_by: currentUser,
    };
    if(scheduleAgain){
      const d = new Date();
      d.setDate(d.getDate()+90);
      update.followed_up = false;
      update.followed_up_at = null;
      update.followup_again_at = d.toISOString().slice(0,10);
    }
    await supabase.from("follow_ups").update(update).eq("id",fuId);
    // Update state optimistically — no reload, no scroll jump
    if(scheduleAgain){
      setFollowUps(prev=>prev.map(fu=>fu.id===fuId?{...fu,...update}:fu));
    } else {
      setFollowUps(prev=>prev.filter(fu=>fu.id!==fuId));
    }
    if(fuEmail?.id===fuId)setFuEmail(null);
  };



  const loadPrevMonth = async (mon, yr) => {
    setPrevMonthLoading(true);
    const prevStart = new Date(yr, mon, 1).toISOString();
    const prevEnd   = new Date(yr, mon + 1, 1).toISOString();
    const prevLabel = new Date(yr, mon, 1).toLocaleString("en-US",{month:"long",year:"numeric"});

    const [
      {data:createdRaw},
      {data:wonRaw},
    ] = await Promise.all([
      supabase.from("quotes").select("id, opportunity, customer, total, data, source")
        .gte("created_at", prevStart).lt("created_at", prevEnd),
      supabase.from("quotes").select("id, opportunity, customer, total, won_date, data")
        .eq("stage","Closed Won")
        .gte("won_date", prevStart.slice(0,10)).lt("won_date", prevEnd.slice(0,10)),
    ]);

    const created = createdRaw || [];
    const won     = (wonRaw || []).map(q=>({...q, type:q.data?.qi?.type||"New Business", total:q.total||0}));
    const wonNew  = won.filter(q=>q.type==="New Business");
    const wonEx   = won.filter(q=>q.type==="Existing Business");

    // Top accounts
    const acctMap = {};
    created.forEach(q=>{
      const name=q.customer||q.data?.qi?.account||"(Unknown)";
      if(!acctMap[name])acctMap[name]={name,total:0,count:0};
      acctMap[name].total+=q.total||0;
      acctMap[name].count+=1;
    });
    const topAccounts=Object.values(acctMap).sort((a,b)=>b.total-a.total).slice(0,5);

    // Top product codes
    const pcodeMap = {};
    created.forEach(q=>{
      (q.data?.summary?.lines||[]).forEach(l=>{
        if(!l.code||!l.val)return;
        if(!pcodeMap[l.code])pcodeMap[l.code]={code:l.code,total:0,count:0};
        pcodeMap[l.code].total+=l.val;
        pcodeMap[l.code].count+=1;
      });
    });
    const topCodes=Object.values(pcodeMap).sort((a,b)=>b.total-a.total).slice(0,8);

    const quoteTotal = created.reduce((a,q)=>a+(q.total||0),0);
    const wonTotal   = won.reduce((a,q)=>a+(q.total||0),0);
    const wonNewTotal= wonNew.reduce((a,q)=>a+(q.total||0),0);
    const wonExTotal = wonEx.reduce((a,q)=>a+(q.total||0),0);
    const capPct     = created.length>0?Math.round((won.length/created.length)*100):0;
    const avgQuote   = created.length>0?Math.round(quoteTotal/created.length):0;

    setPrevMonthData({
      label:prevLabel, created, won, wonNew, wonEx,
      quoteCount:created.length, quoteTotal,
      wonTotal, wonNewTotal, wonExTotal,
      wonCount:won.length, wonNewCount:wonNew.length, wonExCount:wonEx.length,
      capPct, avgQuote, topAccounts, topCodes,
    });
    setPrevMonthLoading(false);
  };

  const goMonth=(mon,yr)=>{
    const now=new Date();
    // Don't allow future months
    if(yr>now.getFullYear()||(yr===now.getFullYear()&&mon>=now.getMonth()))return;
    setSelectedMonth({month:mon,year:yr});
    setPrevMonthData(null);
    loadPrevMonth(mon,yr);
  };

  const loadRecentApproved = async (days) => {
    setRecentApprovedLoading(true);
    const since = new Date(Date.now() - days*24*60*60*1000).toISOString();
    // Fetch recently approved — filter by updated_at broadly, then narrow by decidedAt client-side
    // Use a wider window (3x) to catch quotes approved recently but saved earlier
    const wideSince = new Date(Date.now() - Math.max(days,30)*3*24*60*60*1000).toISOString();
    const [{ data: approvedData }, { data: wonData }] = await Promise.all([
      supabase.from("quotes")
        .select("id, opportunity, customer, total, updated_at, approval_status, won_approval_status, data")
        .eq("approval_status", "approved")
        .gte("updated_at", wideSince)
        .order("updated_at", { ascending: false })
        .limit(500),
      supabase.from("quotes")
        .select("id, opportunity, customer, total, updated_at, approval_status, won_approval_status, data")
        .eq("won_approval_status", "won_approved")
        .gte("updated_at", wideSince)
        .order("updated_at", { ascending: false })
        .limit(500),
    ]);
    // Merge, deduplicate, then filter by actual decidedAt within the requested window
    const seen = new Set();
    const merged = [...(approvedData||[]), ...(wonData||[])]
      .filter(q => { if(seen.has(q.id))return false; seen.add(q.id); return true; });
    const rows = merged.map(q=>({
      id: q.id,
      opp: q.opportunity || q.data?.qi?.opp || "—",
      customer: q.customer || q.data?.qi?.account || "—",
      total: q.total || 0,
      updatedAt: q.updated_at,
      // Use the actual decision date from the blob, fall back to updated_at
      decidedAt: q.won_approval_status==="won_approved"
        ? (q.data?.wonApproval?.decidedAt || q.updated_at)
        : (q.data?.approval?.decidedAt || q.updated_at),
      type: q.won_approval_status==="won_approved" ? "Closed Won" : "Quote",
      decidedBy: q.won_approval_status==="won_approved"
        ? (q.data?.wonApproval?.decidedBy||"")
        : (q.data?.approval?.decidedBy||""),
    }));
    // Filter by actual decidedAt within the requested window, then sort
    const filteredRows = rows.filter(r => r.decidedAt && new Date(r.decidedAt) >= new Date(since));
    filteredRows.sort((a,b)=>new Date(b.decidedAt)-new Date(a.decidedAt));
    setRecentApproved(filteredRows);
    setRecentApprovedLoading(false);
  };

  const load = async () => {
    setLoading(true);
    const now   = new Date();
    const year  = now.getFullYear();
    const month = now.getMonth(); // 0-indexed

    // Build month boundaries for current + 3 prior months
    const months = [];
    for(let i=3; i>=0; i--){
      const d   = new Date(year, month - i, 1);
      const end = new Date(year, month - i + 1, 1);
      months.push({
        label: d.toLocaleString("en-US",{month:"short", year:"numeric"}),
        start: d.toISOString(),
        end:   end.toISOString(),
        isCurrent: i === 0,
      });
    }

    // ── Quotes created this month + Closed Won this month — run in parallel ──
    const thisMonth = months[3];
    const [{ data: createdRaw }, { data: wonRaw }] = await Promise.all([
      supabase
        .from("quotes")
        .select("id, opportunity, customer, total, created_at, revision, data, source")
        .gte("created_at", thisMonth.start)
        .lt("created_at",  thisMonth.end)
        .order("opportunity", {ascending: true}),
      supabase
        .from("quotes")
        .select("id, opportunity, customer, total, won_date, data")
        .eq("stage","Closed Won")
        .gte("won_date", thisMonth.start.slice(0,10))
        .lt("won_date",  thisMonth.end.slice(0,10)),
    ]);
    const created = createdRaw || [];

    // ── Also catch Closed Won quotes where won_date column is null but wonInfo has a date this month ──
    // This covers quotes where won details were saved but won_date column wasn't written (e.g. pre-fix SF imports)
    const { data: wonNullRaw } = await supabase
      .from("quotes")
      .select("id, opportunity, total, won_date, data")
      .eq("stage","Closed Won")
      .is("won_date", null)
      .gte("updated_at", thisMonth.start)
      .lt("updated_at",  thisMonth.end);
    const monthStart = new Date(thisMonth.start);
    const monthEnd   = new Date(thisMonth.end);
    const wonNullFiltered = (wonNullRaw||[]).filter(q => {
      const d = q.data?.wonInfo?.wonDate;
      if(!d) return false;
      const parsed = new Date(d);
      return !isNaN(parsed) && parsed >= monthStart && parsed < monthEnd;
    });
    // Merge — deduplicate by id in case any overlap
    const wonRawMerged = [...(wonRaw||[])];
    const wonRawIds = new Set(wonRawMerged.map(q=>q.id));
    wonNullFiltered.forEach(q=>{ if(!wonRawIds.has(q.id)) wonRawMerged.push(q); });

    // ── Top 10 product codes this month ──
    const pcodeMap = {};
    created.forEach(q => {
      const lines = q.data?.summary?.lines || [];
      lines.forEach(l => {
        if(!l.code||!l.val) return;
        if(!pcodeMap[l.code]) pcodeMap[l.code] = {code:l.code, total:0, count:0};
        pcodeMap[l.code].total += l.val;
        pcodeMap[l.code].count += 1;
      });
    });
    const topCodes = Object.values(pcodeMap)
      .sort((a,b) => b.total - a.total)
      .slice(0, 10);

    // ── Top 5 accounts this month ──
    const acctMap = {};
    created.forEach(q => {
      const name = q.customer || q.data?.qi?.account || "(Unknown)";
      if(!acctMap[name]) acctMap[name] = {name, total:0, count:0};
      acctMap[name].total += q.total || 0;
      acctMap[name].count += 1;
    });
    const topAccounts = Object.values(acctMap)
      .sort((a,b) => b.total - a.total)
      .slice(0, 5);

    // ── Month-over-month quote counts + totals (source=vibrato) ──
    const monthCounts = await Promise.all(months.map(async m => {
      const { data: mRows } = await supabase
        .from("quotes")
        .select("total")
        .gte("created_at", m.start)
        .lt("created_at",  m.end);
      const rows = mRows || [];
      const total = rows.reduce((a,r) => a + (r.total||0), 0);
      return { label: m.label, count: rows.length, total, isCurrent: m.isCurrent };
    }));

    const sortByOpp = arr => [...arr].sort((a,b) => {
      const oa = a.opportunity||a.data?.qi?.opp||"";
      const ob = b.opportunity||b.data?.qi?.opp||"";
      return oa.localeCompare(ob, undefined, {numeric:true, sensitivity:"base"});
    });

    const won         = sortByOpp(wonRawMerged.map(q => ({...q, type: q.data?.qi?.type||"New Business", total: q.total||0})));
    const wonNew      = won.filter(q => q.type === "New Business");
    const wonExisting = won.filter(q => q.type === "Existing Business");
    const wonTotal    = won.reduce((a,q) => a + (q.total||0), 0);

    const yrPrefix = String(year).slice(-2);
    const ytdStart = new Date(year, 0, 1).toISOString();
    const ytdEnd   = new Date(year + 1, 0, 1).toISOString();
    const [{ data: ytdCreatedRaw }, { data: ytdWonRaw }] = await Promise.all([
      supabase.from("quotes").select("id, opportunity, total")
        .gte("created_at", ytdStart).lt("created_at", ytdEnd)
        .limit(2000),
      supabase.from("quotes").select("id, opportunity, total, won_date, data->qi->>type")
        .eq("stage","Closed Won").gte("won_date", ytdStart.slice(0,10)).lt("won_date", ytdEnd.slice(0,10))
        .limit(2000),
    ]);
    const ytdCreated     = ytdCreatedRaw || [];
    const ytdWonAll      = (ytdWonRaw || []).map(q => ({...q, type: q.type||"New Business"}));
    const ytdWonNew      = ytdWonAll.filter(q => q.type === "New Business");
    const ytdWonExisting = ytdWonAll.filter(q => q.type === "Existing Business");
    const ytdQuoteTotal  = ytdCreated.reduce((a,q) => a + (q.total||0), 0);
    const ytdWonNewTotal = ytdWonNew.reduce((a,q) => a + (q.total||0), 0);
    const ytdWonExTotal  = ytdWonExisting.reduce((a,q) => a + (q.total||0), 0);
    const ytdWonTotal    = ytdWonNewTotal + ytdWonExTotal;
    setData({ created, monthCounts, won, wonNew, wonExisting, wonTotal, topCodes, topAccounts,
      ytdQuoteCount: ytdCreated.length, ytdQuoteTotal, ytdWonNewTotal, ytdWonExTotal, ytdWonTotal, yrPrefix });
    setLoading(false);
  };

  useEffect(()=>{ load(); loadFollowUps(); loadFlags(); },[]);

  const TARGET = 175000;
  const money  = n => "$"+(isNaN(n)||n==null?0:Math.round(n)).toLocaleString();
  const pct    = v => Math.round((v/TARGET)*100);


  return(
    <div style={{flex:1,overflowY:"auto",padding:"28px 32px",background:"#f0f2f5",fontFamily:"Segoe UI,system-ui,sans-serif"}}>
      <div style={{maxWidth:1100,margin:"0 auto"}}>

        {/* Title row */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:24,flexWrap:"wrap",gap:12}}>
          <div>
            <div style={{fontSize:22,fontWeight:700,color:"#1a2332"}}>Dashboard</div>
            <div style={{fontSize:12,color:"#6b7a8d",marginTop:2}}>
              {new Date().toLocaleString("en-US",{month:"long",year:"numeric"})}
            </div>
          </div>
          <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
            {/* Privacy Mode toggle */}
            <button onClick={()=>setPrivacyMode(v=>!v)}
              style={{background:privacyMode?"#1a2332":"#fff",border:"1px solid "+(privacyMode?"#1a2332":"#d0d7de"),borderRadius:8,padding:"8px 18px",
                fontWeight:600,fontSize:12,cursor:"pointer",color:privacyMode?"#fff":"#1a2332",letterSpacing:.2}}>
              Privacy Mode
            </button>
            {/* Account lookup */}
            <div ref={acctRef} style={{position:"relative"}}>
              <div style={{display:"flex",gap:0,alignItems:"center",background:"#fff",
                border:"1px solid #d0d7de",borderRadius:8,overflow:"hidden"}}>
                <span style={{padding:"0 10px",fontSize:14,color:"#9aa5b1"}}>🏢</span>
                <input
                  value={acctSearch}
                  onChange={e=>{setAcctSearch(e.target.value);}}
                  placeholder="Account lookup…"
                  style={{border:"none",outline:"none",padding:"8px 4px",fontSize:12,
                    fontFamily:"inherit",width:180,color:"#1a2332"}}/>
                {acctSearch&&(
                  <button onClick={()=>{setAcctSearch("");setAcctResults([]);setAcctOpen(false);}}
                    style={{background:"none",border:"none",padding:"0 10px",cursor:"pointer",
                      color:"#9aa5b1",fontSize:14}}>×</button>
                )}
              </div>
              {acctOpen&&acctResults.length>0&&(
                <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:3000,
                  background:"#fff",border:"1px solid #d0d7de",borderRadius:8,
                  boxShadow:"0 4px 16px rgba(0,0,0,0.12)",maxHeight:240,overflowY:"auto",marginTop:3}}>
                  {acctResults.map(name=>(
                    <div key={name}
                      onMouseDown={()=>{setAcctModal(name);setAcctSearch("");setAcctOpen(false);}}
                      style={{padding:"9px 14px",cursor:"pointer",fontSize:12,
                        borderBottom:"1px solid #f0f2f5",transition:"background .1s"}}
                      onMouseEnter={e=>e.currentTarget.style.background="#f0f4ff"}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      {name}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button onClick={()=>{load();loadFollowUps();loadFlags();if(onRefreshComplete)onRefreshComplete();}}              style={{background:needsRefresh?"#1a5276":"#fff",border:"1px solid "+(needsRefresh?"#1a5276":"#d0d7de"),borderRadius:8,padding:"8px 18px",
                fontWeight:600,fontSize:12,cursor:"pointer",color:needsRefresh?"#fff":"#1a2332",display:"flex",alignItems:"center",gap:6}}>
              {needsRefresh?"↻ Updates available":"↻ Refresh"}
            </button>
            <button onClick={()=>{setShowPrevMonth(true);if(!prevMonthData)loadPrevMonth(selectedMonth.month,selectedMonth.year);}}
              style={{background:"#fff",border:"1px solid #d0d7de",borderRadius:8,padding:"8px 18px",
                fontWeight:600,fontSize:12,cursor:"pointer",color:"#1a2332",display:"flex",alignItems:"center",gap:6}}>
              📅 Last Month
            </button>
            <button onClick={onEnterQuote}
              style={{background:"#1a5276",border:"none",borderRadius:8,padding:"8px 20px",
                fontWeight:700,fontSize:12,cursor:"pointer",color:"#fff",letterSpacing:.5}}>
              + New Quote
            </button>
          </div>
        </div>
        {/* Previous Month Snapshot Modal */}
        {showPrevMonth&&(
          <div onClick={e=>{if(e.target===e.currentTarget)setShowPrevMonth(false);}}
            style={{position:"fixed",inset:0,zIndex:2000,background:"rgba(0,0,0,0.45)",
              display:"flex",alignItems:"flex-start",justifyContent:"center",
              overflowY:"auto",padding:"40px 16px"}}>
            <div style={{background:"#fff",borderRadius:14,width:"100%",maxWidth:760,
              boxShadow:"0 8px 40px rgba(0,0,0,0.18)",padding:"28px 32px",position:"relative"}}>
              {/* Close */}
              <button onClick={()=>setShowPrevMonth(false)}
                style={{position:"absolute",top:16,right:16,background:"none",border:"none",
                  fontSize:20,cursor:"pointer",color:"#9aa5b1",lineHeight:1}}>✕</button>

              <div style={{fontSize:18,fontWeight:800,color:"#1a2332",marginBottom:16}}>
                📅 Monthly Snapshot
              </div>

              {/* Month / Year picker */}
              {(()=>{
                const MONTHS=["January","February","March","April","May","June",
                              "July","August","September","October","November","December"];
                const currentYear=new Date().getFullYear();
                const currentMonthIdx=new Date().getMonth();
                // Go back to 2016 to cover all SF-imported historical data
                const oldestYear=2016;
                const years=Array.from({length:currentYear-oldestYear+1},(_,i)=>currentYear-i);
                const prevM=selectedMonth.month===0?11:selectedMonth.month-1;
                const prevY=selectedMonth.month===0?selectedMonth.year-1:selectedMonth.year;
                const nextM=selectedMonth.month===11?0:selectedMonth.month+1;
                const nextY=selectedMonth.month===11?selectedMonth.year+1:selectedMonth.year;
                const now=new Date();
                const nextDisabled=nextY>now.getFullYear()||(nextY===now.getFullYear()&&nextM>=now.getMonth());
                return(
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20,flexWrap:"wrap"}}>
                    <button onClick={()=>goMonth(prevM,prevY)}
                      style={{background:"#f0f2f5",border:"none",borderRadius:6,width:30,height:30,
                        cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>
                      ‹
                    </button>
                    <select value={selectedMonth.month}
                      onChange={e=>goMonth(Number(e.target.value),selectedMonth.year)}
                      style={{border:"1px solid #d0d7de",borderRadius:6,padding:"6px 10px",
                        fontSize:13,fontWeight:600,color:"#1a2332",cursor:"pointer",fontFamily:"inherit"}}>
                      {MONTHS.map((m,i)=>{
                        const now=new Date();
                        // Disable current and future months
                        const disabled=selectedMonth.year===now.getFullYear()&&i>=now.getMonth();
                        return <option key={m} value={i} disabled={disabled}>{m}</option>;
                      })}
                    </select>
                    <select value={selectedMonth.year}
                      onChange={e=>goMonth(selectedMonth.month,Number(e.target.value))}
                      style={{border:"1px solid #d0d7de",borderRadius:6,padding:"6px 10px",
                        fontSize:13,fontWeight:600,color:"#1a2332",cursor:"pointer",fontFamily:"inherit"}}>
                      {years.map(y=><option key={y} value={y}>{y}</option>)}
                    </select>
                    <button onClick={()=>!nextDisabled&&goMonth(nextM,nextY)}
                      style={{background:"#f0f2f5",border:"none",borderRadius:6,width:30,height:30,
                        cursor:nextDisabled?"not-allowed":"pointer",fontSize:16,
                        opacity:nextDisabled?0.35:1,
                        display:"flex",alignItems:"center",justifyContent:"center"}}>
                      ›
                    </button>
                    {prevMonthLoading&&(
                      <span style={{fontSize:12,color:"#9aa5b1",marginLeft:8}}>Loading…</span>
                    )}
                  </div>
                );
              })()}

              {prevMonthLoading?(
                <div style={{textAlign:"center",padding:40,color:"#9aa5b1",fontSize:13}}>Loading…</div>
              ):!prevMonthData?(
                <div style={{textAlign:"center",padding:40,color:"#9aa5b1",fontSize:13}}>Select a month above</div>
              ):prevMonthData&&(()=>{
                const pm=prevMonthData;
                const money=n=>"$"+(isNaN(n)||n==null?0:Math.round(n)).toLocaleString();
                const capColor=pm.capPct>=50?"#1e8449":pm.capPct>=25?"#b7791f":"#c0392b";
                return(
                  <div>
                    {/* Top stat row */}
                    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
                      {[
                        {label:"QUOTES CREATED", val:pm.quoteCount, sub:money(pm.quoteTotal)+" total value", color:"#1a2332"},
                        {label:"AVG QUOTE VALUE", val:money(pm.avgQuote), sub:pm.quoteCount+" quotes", color:"#1a2332"},
                        {label:"CLOSED WON", val:money(pm.wonTotal), sub:pm.wonCount+" quote"+(pm.wonCount!==1?"s":""), color:"#1e8449"},
                        {label:"CAPTURE RATE", val:pm.capPct+"%", sub:pm.wonCount+" won / "+pm.quoteCount+" quoted", color:capColor},
                      ].map(s=>(
                        <div key={s.label} style={{background:"#f8f9fb",borderRadius:10,padding:"14px 16px",border:"1px solid #e8ecf0"}}>
                          <div style={{fontSize:9,fontWeight:700,letterSpacing:1.2,color:"#9aa5b1",marginBottom:6}}>{s.label}</div>
                          <div style={{fontSize:22,fontWeight:800,color:s.color,lineHeight:1}}>{s.val}</div>
                          <div style={{fontSize:11,color:"#9aa5b1",marginTop:4}}>{s.sub}</div>
                        </div>
                      ))}
                    </div>

                    {/* Closed Won breakdown */}
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20}}>
                      {[
                        {label:"NEW BUSINESS", val:pm.wonNewTotal, count:pm.wonNewCount, color:"#1e8449"},
                        {label:"EXISTING BUSINESS", val:pm.wonExTotal, count:pm.wonExCount, color:"#2e6da4"},
                      ].map(s=>(
                        <div key={s.label} style={{background:"#f8f9fb",borderRadius:10,padding:"14px 16px",border:"1px solid #e8ecf0"}}>
                          <div style={{fontSize:9,fontWeight:700,letterSpacing:1.2,color:"#9aa5b1",marginBottom:4}}>CLOSED WON — {s.label}</div>
                          <div style={{fontSize:22,fontWeight:800,color:s.color,lineHeight:1}}>{money(s.val)}</div>
                          <div style={{fontSize:11,color:"#9aa5b1",marginTop:3}}>{s.count} quote{s.count!==1?"s":""}</div>
                        </div>
                      ))}
                    </div>

                    {/* Top accounts + top codes side by side */}
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                      {/* Top accounts */}
                      <div style={{background:"#f8f9fb",borderRadius:10,padding:"14px 16px",border:"1px solid #e8ecf0"}}>
                        <div style={{fontSize:9,fontWeight:700,letterSpacing:1.2,color:"#9aa5b1",marginBottom:10}}>TOP ACCOUNTS BY QUOTE VALUE</div>
                        {pm.topAccounts.length===0?(
                          <div style={{fontSize:12,color:"#9aa5b1",fontStyle:"italic"}}>None</div>
                        ):pm.topAccounts.map((a,i)=>(
                          <div key={a.name} style={{display:"flex",justifyContent:"space-between",
                            alignItems:"center",padding:"5px 0",
                            borderTop:i>0?"1px solid #e8ecf0":"none",fontSize:12}}>
                            <span style={{color:"#1a2332",fontWeight:i===0?700:400,
                              overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
                              maxWidth:"60%"}}>{a.name}</span>
                            <span style={{color:"#1a5276",fontWeight:600,flexShrink:0}}>{money(a.total)}</span>
                          </div>
                        ))}
                      </div>
                      {/* Top product codes */}
                      <div style={{background:"#f8f9fb",borderRadius:10,padding:"14px 16px",border:"1px solid #e8ecf0"}}>
                        <div style={{fontSize:9,fontWeight:700,letterSpacing:1.2,color:"#9aa5b1",marginBottom:10}}>TOP PRODUCT CODES</div>
                        {pm.topCodes.length===0?(
                          <div style={{fontSize:12,color:"#9aa5b1",fontStyle:"italic"}}>None</div>
                        ):pm.topCodes.map((c,i)=>(
                          <div key={c.code} style={{display:"flex",justifyContent:"space-between",
                            alignItems:"center",padding:"5px 0",
                            borderTop:i>0?"1px solid #e8ecf0":"none",fontSize:12}}>
                            <span style={{color:"#1a2332",fontWeight:600}}>{c.code}</span>
                            <span style={{color:"#6b7a8d"}}>{c.count}×</span>
                            <span style={{color:"#1a5276",fontWeight:600}}>{money(c.total)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* Recently Approved Modal */}
        {showRecentApproved&&(
          <div onClick={e=>{if(e.target===e.currentTarget)setShowRecentApproved(false);}}
            style={{position:"fixed",inset:0,zIndex:2000,background:"rgba(0,0,0,0.45)",
              display:"flex",alignItems:"flex-start",justifyContent:"center",
              overflowY:"auto",padding:"40px 16px"}}>
            <div style={{background:"#fff",borderRadius:14,width:"100%",maxWidth:700,
              boxShadow:"0 8px 40px rgba(0,0,0,0.18)",padding:"28px 32px",position:"relative"}}>
              <button onClick={()=>setShowRecentApproved(false)}
                style={{position:"absolute",top:16,right:16,background:"none",border:"none",
                  fontSize:20,cursor:"pointer",color:"#9aa5b1",lineHeight:1}}>✕</button>
              <div style={{fontSize:18,fontWeight:800,color:"#1a2332",marginBottom:4}}>
                ✓ Recently Approved
              </div>
              {/* Day selector */}
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:20}}>
                <span style={{fontSize:12,color:"#6b7a8d"}}>Show last</span>
                {[7,14,30].map(d=>(
                  <button key={d} onClick={()=>{setRecentDays(d);setRecentApproved(null);loadRecentApproved(d);}}
                    style={{background:recentDays===d?"#1a5276":"#f0f2f5",
                      border:"none",borderRadius:6,padding:"4px 12px",
                      fontSize:12,fontWeight:600,cursor:"pointer",
                      color:recentDays===d?"#fff":"#1a2332"}}>
                    {d} days
                  </button>
                ))}
                {recentApprovedLoading&&<span style={{fontSize:12,color:"#9aa5b1",marginLeft:4}}>Loading…</span>}
              </div>
              {/* Results */}
              {!recentApprovedLoading&&recentApproved&&(
                recentApproved.length===0?(
                  <div style={{textAlign:"center",padding:"32px 0",color:"#9aa5b1",fontSize:13}}>
                    No approvals in the last {recentDays} days
                  </div>
                ):(
                  <div>
                    {/* Header row */}
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1.2fr 80px 100px 100px",
                      gap:8,padding:"6px 0",borderBottom:"2px solid #e8ecf0",marginBottom:4}}>
                      {["OPP #","CUSTOMER","TYPE","TOTAL","APPROVED"].map(h=>(
                        <div key={h} style={{fontSize:9,fontWeight:700,letterSpacing:1,color:"#9aa5b1"}}>{h}</div>
                      ))}
                    </div>
                    {recentApproved.map((q,i)=>(
                      <div key={q.id}
                        onClick={async()=>{
                          if(!onLoadQuote)return;
                          const {data:row}=await supabase.from("quotes")
                            .select("id,opportunity,customer,rfq,revision,stage,total,approval_status,won_approval_status,updated_at,data,source")
                            .eq("id",q.id).single();
                          if(row){
                            const blob=row.data||{};
                            onLoadQuote({...blob,id:row.id,
                              opp:row.opportunity||blob.opp,
                              customer:row.customer||blob.customer,
                              rfq:row.rfq||blob.rfq,
                              total:row.total??blob.total,
                              savedAt:row.updated_at,
                              source:row.source||"vibrato",
                              approval:{...(blob.approval||{}),status:row.approval_status||"none"},
                              wonApproval:{...(blob.wonApproval||{}),status:row.won_approval_status||"none"},
                            });
                          }
                          setShowRecentApproved(false);
                        }}
                        style={{display:"grid",gridTemplateColumns:"1fr 1.2fr 80px 100px 100px",
                          gap:8,padding:"9px 0",cursor:"pointer",
                          borderBottom:"1px solid #f0f2f5",
                          background:"transparent"}}
                        onMouseEnter={e=>e.currentTarget.style.background="#f8f9fb"}
                        onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                        <div style={{fontWeight:700,color:"#1a5276",fontSize:12}}>{q.opp}</div>
                        <div style={{fontSize:12,color:"#1a2332",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{q.customer}</div>
                        <div>
                          <span style={{fontSize:10,fontWeight:700,
                            background:q.type==="Closed Won"?"#d1fae5":"#eff6ff",
                            color:q.type==="Closed Won"?"#065f46":"#1e40af",
                            borderRadius:4,padding:"2px 6px"}}>
                            {q.type}
                          </span>
                        </div>
                        <div style={{fontSize:12,fontWeight:600,color:"#1e8449"}}>
                          {"$"+(q.total||0).toLocaleString()}
                        </div>
                        <div style={{fontSize:11,color:"#6b7a8d"}}>
                          {new Date(q.decidedAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}
                          {q.decidedBy&&<div style={{fontSize:10,color:"#9aa5b1"}}>{q.decidedBy.split("@")[0]}</div>}
                        </div>
                      </div>
                    ))}
                    <div style={{marginTop:12,fontSize:11,color:"#9aa5b1",textAlign:"right"}}>
                      {recentApproved.length} approval{recentApproved.length!==1?"s":""} · click a row to open the quote
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        )}

        {/* Account Dashboard modal */}
        {acctModal&&(
          <AccountDashboard
            accountName={acctModal}
            onClose={()=>setAcctModal(null)}
            onLoadQuote={q=>{onLoadQuote&&onLoadQuote(q);setAcctModal(null);}}
            onNewQuote={name=>{onNewQuoteForAccount&&onNewQuoteForAccount(name);setAcctModal(null);}}
          />
        )}

        <div style={{filter:privacyMode?"blur(9px)":"none",transition:"filter 0.2s ease",pointerEvents:privacyMode?"none":"auto",userSelect:privacyMode?"none":"auto"}}>
        {loading?(
          <div style={{textAlign:"center",padding:80,color:"#9aa5b1",fontSize:14}}>Loading…</div>
        ):(
          <div>
            {/* ── Top stat cards — 2 cols: Quotes | Won+Target ── */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 2fr",gap:16,marginBottom:20}}>
              <div style={{background:"#fff",borderRadius:12,padding:"20px 24px",boxShadow:"0 1px 4px rgba(0,0,0,0.07)",border:"1px solid #e8ecf0"}}>
                <div style={{fontSize:10,fontWeight:700,letterSpacing:1.5,color:"#9aa5b1",marginBottom:8}}>QUOTES THIS MONTH</div>
                <div style={{fontSize:36,fontWeight:800,color:"#1a2332",lineHeight:1}}>{data.created.length}</div>
                <div style={{fontSize:12,color:"#6b7a8d",marginTop:6}}>
                  Total value: <span style={{fontWeight:700,color:"#1a5276"}}>{money(data.created.reduce((a,q)=>a+(q.total||0),0))}</span>
                </div>
                {(()=>{
                  const createdCount=data.created.length;
                  const wonCount=data.won.length;
                  const capPct=createdCount>0?Math.round((wonCount/createdCount)*100):0;
                  const capColor=capPct>=50?"#1e8449":capPct>=25?"#b7791f":"#c0392b";
                  return createdCount>0?(
                    <div style={{marginTop:10,paddingTop:10,borderTop:"1px solid #f0f2f5"}}>
                      <div style={{fontSize:10,fontWeight:700,letterSpacing:1,color:"#9aa5b1",marginBottom:4}}>CAPTURE RATE</div>
                      <div style={{display:"flex",alignItems:"baseline",gap:6}}>
                        <span style={{fontSize:24,fontWeight:800,color:capColor}}>{capPct}%</span>
                        <span style={{fontSize:11,color:"#6b7a8d"}}>{wonCount} won / {createdCount} quoted</span>
                      </div>
                      <div style={{marginTop:6,height:6,background:"#e8ecf0",borderRadius:4,overflow:"hidden"}}>
                        <div style={{height:"100%",width:capPct+"%",background:capColor,borderRadius:4,transition:"width 0.6s ease"}}/>
                      </div>
                    </div>
                  ):null;
                })()}
              </div>
              {(()=>{
                const over=data.wonTotal>=TARGET;
                const rawPct=pct(data.wonTotal);
                const barColor=over?"#1e8449":data.wonTotal>TARGET*0.7?"#b7791f":"#1a5276";
                const overflowAmt=over?data.wonTotal-TARGET:0;
                const overflowPct=over?Math.round((overflowAmt/TARGET)*100):0;
                const displayScale=Math.max(1,data.wonTotal/TARGET);
                const targetBarW=Math.round((1/displayScale)*100);
                const overBarW=Math.round((overflowAmt/TARGET)/displayScale*100);
                return(
                  <div style={{background:over?"#f0faf4":"#fff",borderRadius:12,padding:"20px 24px",
                    boxShadow:"0 1px 4px rgba(0,0,0,0.07)",border:"1px solid "+(over?"#a7f3d0":"#e8ecf0")}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                      <div style={{fontSize:10,fontWeight:700,letterSpacing:1.5,color:"#9aa5b1"}}>CLOSED WON THIS MONTH · MONTHLY TARGET</div>
                      {over&&<span style={{fontSize:10,background:"#d1fae5",color:"#065f46",borderRadius:4,padding:"2px 7px",fontWeight:700}}>🎉 EXCEEDED</span>}
                    </div>
                    <div style={{display:"flex",alignItems:"baseline",gap:16,marginBottom:4}}>
                      <div>
                        <div style={{fontSize:32,fontWeight:800,color:over?"#1e8449":"#1a2332",lineHeight:1}}>{money(data.wonTotal)}</div>
                        <div style={{fontSize:11,color:"#9aa5b1",marginTop:2}}>
                          {data.won.length} quote{data.won.length!==1?"s":""} · {data.wonNew.length} new · {data.wonExisting.length} existing
                        </div>
                      </div>
                      <div style={{color:"#d0d7de",fontSize:28,fontWeight:200,lineHeight:1,alignSelf:"center"}}>/</div>
                      <div>
                        <div style={{fontSize:32,fontWeight:800,color:"#9aa5b1",lineHeight:1}}>{money(TARGET)}</div>
                        <div style={{fontSize:11,color:"#9aa5b1",marginTop:2}}>monthly target · <span style={{fontWeight:700,color:over?"#1e8449":barColor}}>{rawPct}%</span></div>
                      </div>
                    </div>
                    <div style={{margin:"12px 0 8px"}}>
                      <div style={{position:"relative",height:16,background:"#e8ecf0",borderRadius:8,overflow:"hidden"}}>
                        <div style={{position:"absolute",left:0,top:0,bottom:0,
                          width:(over?targetBarW:Math.round(Math.min(data.wonTotal/TARGET,1)*100))+"%",
                          background:barColor,borderRadius:"8px 0 0 8px",transition:"width 0.6s ease"}}/>
                        {over&&<div style={{position:"absolute",left:targetBarW+"%",top:2,bottom:2,
                          width:overBarW+"%",background:"#34d399",borderRadius:"0 6px 6px 0",transition:"width 0.6s ease"}}/>}
                        <div style={{position:"absolute",left:targetBarW+"%",top:0,bottom:0,width:2,background:"rgba(255,255,255,0.8)"}}/>
                      </div>
                    </div>
                    <div style={{fontSize:11,color:"#6b7a8d",display:"flex",justifyContent:"space-between"}}>
                      {over
                        ?<><span style={{color:"#1e8449",fontWeight:700}}>+{money(overflowAmt)} over target</span><span>+{overflowPct}%</span></>
                        :<><span>{money(TARGET-data.wonTotal)} remaining</span><span>{100-rawPct}% to go</span></>
                      }
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* ── Closed Won breakdown ── */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:20}}>
              {[
                {label:"New Business", items:data.wonNew, color:"#1e8449"},
                {label:"Existing Business", items:data.wonExisting, color:"#2e6da4"},
              ].map(({label,items,color})=>(
                <div key={label} style={{background:"#fff",borderRadius:12,padding:"20px 24px",
                  boxShadow:"0 1px 4px rgba(0,0,0,0.07)",border:"1px solid #e8ecf0"}}>
                  <div style={{fontSize:10,fontWeight:700,letterSpacing:1.5,color:"#9aa5b1",marginBottom:12}}>
                    CLOSED WON — {label.toUpperCase()}
                  </div>
                  {items.length===0?(
                    <div style={{fontSize:12,color:"#9aa5b1",fontStyle:"italic"}}>None this month</div>
                  ):(
                    <>
                      <div style={{fontSize:22,fontWeight:800,color,marginBottom:8}}>
                        {money(items.reduce((a,q)=>a+(q.total||0),0))}
                      </div>
                      {/* Column headers */}
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                        fontSize:9,fontWeight:700,letterSpacing:.8,color:"#9aa5b1",
                        borderBottom:"1px solid #e8ecf0",paddingBottom:4,marginBottom:2,gap:8}}>
                        <span style={{flexShrink:0}}>OPP #</span>
                        <span style={{flex:1}}>ACCOUNT</span>
                        <span style={{flexShrink:0}}>TOTAL</span>
                      </div>
                      {items.map(q=>{
                        const acct=q.customer||q.data?.qi?.account||"";
                        return(
                          <div key={q.id} style={{display:"flex",alignItems:"center",
                            justifyContent:"space-between",fontSize:11,color:"#6b7a8d",
                            borderTop:"1px solid #f0f2f5",padding:"5px 0",gap:8}}>
                            <span
                              onClick={()=>{
                                if(!onLoadQuote)return;
                                const blob=q.data||{};
                                onLoadQuote({
                                  ...blob,
                                  id:q.id,
                                  source:blob.source||"vibrato",
                                  customer:q.customer||blob.customer,
                                  total:q.total||blob.total,
                                });
                              }}
                              style={{fontWeight:700,color:"#1a5276",cursor:"pointer",
                                textDecoration:"underline",textDecorationColor:"rgba(26,82,118,0.4)",
                                flexShrink:0}}>
                              {q.opportunity}
                            </span>
                            <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",
                              whiteSpace:"nowrap",color:"#6b7a8d"}}>
                              {acct}
                            </span>
                            <span style={{fontWeight:600,color:"#1a2332",flexShrink:0}}>
                              {money(q.total||0)}
                            </span>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              ))}
            </div>

            {/* ── YTD Metrics ── */}
            {(()=>{
              const yr="20"+data.yrPrefix;
              return(
                <div style={{background:"#fff",borderRadius:12,padding:"20px 24px",
                  boxShadow:"0 1px 4px rgba(0,0,0,0.07)",border:"1px solid #e8ecf0",marginBottom:20}}>
                  <div style={{fontSize:10,fontWeight:700,letterSpacing:1.5,color:"#9aa5b1",marginBottom:14}}>
                    YEAR TO DATE — {yr} (ALL QUOTES)
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:16}}>
                    <div>
                      <div style={{fontSize:10,color:"#9aa5b1",fontWeight:600,letterSpacing:.8,marginBottom:4}}>QUOTES CREATED</div>
                      <div style={{fontSize:26,fontWeight:800,color:"#1a2332",lineHeight:1}}>{data.ytdQuoteCount}</div>
                      <div style={{fontSize:11,color:"#6b7a8d",marginTop:3}}>{money(data.ytdQuoteTotal)} total value</div>
                    </div>
                    <div>
                      <div style={{fontSize:10,color:"#9aa5b1",fontWeight:600,letterSpacing:.8,marginBottom:4}}>CLOSED WON TOTAL</div>
                      <div style={{fontSize:26,fontWeight:800,color:"#1e8449",lineHeight:1}}>{money(data.ytdWonTotal)}</div>
                      <div style={{fontSize:11,color:"#6b7a8d",marginTop:3}}>
                        {data.ytdQuoteTotal>0?Math.round((data.ytdWonTotal/data.ytdQuoteTotal)*100):0}% of quoted value
                      </div>
                    </div>
                    <div>
                      <div style={{fontSize:10,color:"#9aa5b1",fontWeight:600,letterSpacing:.8,marginBottom:4}}>WON — NEW BUSINESS</div>
                      <div style={{fontSize:26,fontWeight:800,color:"#1e8449",lineHeight:1}}>{money(data.ytdWonNewTotal)}</div>
                      <div style={{fontSize:11,color:"#6b7a8d",marginTop:3}}>
                        {data.ytdWonTotal>0?Math.round((data.ytdWonNewTotal/data.ytdWonTotal)*100):0}% of won total
                      </div>
                    </div>
                    <div>
                      <div style={{fontSize:10,color:"#9aa5b1",fontWeight:600,letterSpacing:.8,marginBottom:4}}>WON — EXISTING BUSINESS</div>
                      <div style={{fontSize:26,fontWeight:800,color:"#2e6da4",lineHeight:1}}>{money(data.ytdWonExTotal)}</div>
                      <div style={{fontSize:11,color:"#6b7a8d",marginTop:3}}>
                        {data.ytdWonTotal>0?Math.round((data.ytdWonExTotal/data.ytdWonTotal)*100):0}% of won total
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* ── 3-Month Running Averages ── */}
            {(()=>{
              const months=data.monthCounts;
              const prior3=months.slice(0,3);
              const current=months[3];
              const avgCount=prior3.length>0?prior3.reduce((a,m)=>a+m.count,0)/prior3.length:0;
              const avgTotal=prior3.length>0?prior3.reduce((a,m)=>a+m.total,0)/prior3.length:0;
              const countDiff=current.count-avgCount;
              const totalDiff=current.total-avgTotal;
              const countUp=countDiff>=0;
              const totalUp=totalDiff>=0;
              const fmt=n=>n>=1000?"$"+(n/1000).toFixed(1)+"k":"$"+Math.round(n);
              const diffColor=(up)=>up?"#1e8449":"#c0392b";
              const arrow=(up)=>up?"▲":"▼";
              return(
                <div style={{background:"#fff",borderRadius:12,padding:"20px 24px",
                  boxShadow:"0 1px 4px rgba(0,0,0,0.07)",border:"1px solid #e8ecf0",marginBottom:20}}>
                  <div style={{fontSize:10,fontWeight:700,letterSpacing:1.5,color:"#9aa5b1",marginBottom:14}}>
                    3-MONTH RUNNING AVERAGES (vs. CURRENT MONTH)
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:0}}>
                    <div style={{fontSize:9,fontWeight:700,letterSpacing:.8,color:"#9aa5b1",paddingBottom:8,borderBottom:"1px solid #f0f2f5"}}></div>
                    {prior3.map(m=>(
                      <div key={m.label} style={{fontSize:9,fontWeight:700,letterSpacing:.8,color:"#9aa5b1",
                        paddingBottom:8,borderBottom:"1px solid #f0f2f5",textAlign:"center"}}>{m.label}</div>
                    ))}
                    <div style={{fontSize:10,fontWeight:700,color:"#6b7a8d",padding:"10px 0 6px",borderBottom:"1px solid #f0f2f5"}}># QUOTES</div>
                    {prior3.map(m=>(
                      <div key={m.label} style={{textAlign:"center",padding:"10px 0 6px",borderBottom:"1px solid #f0f2f5"}}>
                        <span style={{fontSize:16,fontWeight:700,color:"#1a2332"}}>{m.count}</span>
                      </div>
                    ))}
                    <div style={{fontSize:10,fontWeight:700,color:"#6b7a8d",padding:"10px 0 6px",borderBottom:"1px solid #f0f2f5"}}>AVG QUOTE VALUE</div>
                    {prior3.map(m=>(
                      <div key={m.label} style={{textAlign:"center",padding:"10px 0 6px",borderBottom:"1px solid #f0f2f5"}}>
                        <span style={{fontSize:13,fontWeight:600,color:"#1a2332"}}>{m.count>0?fmt(m.total/m.count):"—"}</span>
                      </div>
                    ))}
                    <div style={{fontSize:10,fontWeight:700,color:"#6b7a8d",padding:"10px 0 0"}}>TOTAL VALUE</div>
                    {prior3.map(m=>(
                      <div key={m.label} style={{textAlign:"center",padding:"10px 0 0"}}>
                        <span style={{fontSize:13,fontWeight:600,color:"#1a5276"}}>{fmt(m.total)}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{marginTop:14,paddingTop:14,borderTop:"2px solid #f0f2f5",
                    display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16}}>
                    <div>
                      <div style={{fontSize:9,fontWeight:700,letterSpacing:.8,color:"#9aa5b1",marginBottom:4}}>
                        {current.label.toUpperCase()} — QUOTES
                      </div>
                      <div style={{display:"flex",alignItems:"baseline",gap:8}}>
                        <span style={{fontSize:22,fontWeight:800,color:"#1a5276"}}>{current.count}</span>
                        <span style={{fontSize:11,fontWeight:700,color:diffColor(countUp)}}>
                          {arrow(countUp)} {Math.abs(countDiff).toFixed(1)} vs 3-mo avg ({Math.round(avgCount)})
                        </span>
                      </div>
                    </div>
                    <div>
                      <div style={{fontSize:9,fontWeight:700,letterSpacing:.8,color:"#9aa5b1",marginBottom:4}}>
                        {current.label.toUpperCase()} — AVG QUOTE VALUE
                      </div>
                      <div style={{display:"flex",alignItems:"baseline",gap:8}}>
                        <span style={{fontSize:22,fontWeight:800,color:"#1a2332"}}>{current.count>0?fmt(current.total/current.count):"—"}</span>
                        {current.count>0&&avgCount>0&&(
                          <span style={{fontSize:11,fontWeight:700,color:diffColor((current.total/current.count)>=(avgTotal/avgCount))}}>
                            {arrow((current.total/current.count)>=(avgTotal/avgCount))} {fmt(Math.abs((current.total/current.count)-(avgTotal/avgCount)))} vs avg
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      <div style={{fontSize:9,fontWeight:700,letterSpacing:.8,color:"#9aa5b1",marginBottom:4}}>
                        {current.label.toUpperCase()} — TOTAL VALUE
                      </div>
                      <div style={{display:"flex",alignItems:"baseline",gap:8}}>
                        <span style={{fontSize:22,fontWeight:800,color:"#1a5276"}}>{fmt(current.total)}</span>
                        <span style={{fontSize:11,fontWeight:700,color:diffColor(totalUp)}}>
                          {arrow(totalUp)} {fmt(Math.abs(totalDiff))} vs 3-mo avg
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* ── Flagged Quotes widget ── */}
            {flaggedQuotes.length>0&&(
              <div style={{background:"#fff",borderRadius:12,boxShadow:"0 1px 4px rgba(0,0,0,0.07)",
                border:"1px solid #fca5a5",overflow:"hidden",marginBottom:20}}>
                <div style={{padding:"14px 24px",borderBottom:"1px solid #fca5a5",
                  display:"flex",alignItems:"center",justifyContent:"space-between",
                  background:"#fff5f5"}}>
                  <div>
                    <div style={{fontSize:10,fontWeight:700,letterSpacing:1.5,color:"#b91c1c"}}>
                      🚩 FLAGGED QUOTES
                    </div>
                    <div style={{fontSize:11,color:"#9aa5b1",marginTop:2}}>
                      {flaggedQuotes.length} quote{flaggedQuotes.length!==1?"s":""} need attention
                    </div>
                  </div>
                  <button onClick={loadFlags}
                    style={{background:"none",border:"1px solid #fca5a5",borderRadius:6,
                      padding:"4px 12px",fontSize:11,cursor:"pointer",color:"#b91c1c"}}>
                    ↻ Refresh
                  </button>
                </div>
                <div>
                  {flaggedQuotes.map(f=>(
                    <div key={f.id}
                      data-quoteid={String(f.quote_id)}
                      onClick={e=>{
                        if(!onLoadQuote)return;
                        const qid=Number(e.currentTarget.getAttribute('data-quoteid'));
                        supabase.from("quotes")
                          .select("id,opportunity,customer,rfq,revision,stage,total,approval_status,won_approval_status,updated_at,data,source")
                          .eq("id",qid)
                          .single()
                          .then(({data:row})=>{
                            if(!row)return;
                            const q=row.data||{};
                            const match={...q,id:row.id,opp:row.opportunity||q.opp,
                              customer:row.customer||q.customer,rfq:row.rfq||q.rfq,
                              total:row.total??q.total,savedAt:row.updated_at,
                              source:"vibrato",
                              approval:{...(q.approval||{}),status:row.approval_status||q.approval?.status||"none"}};
                            onLoadQuote(match);
                          });
                      }}
                      style={{padding:"12px 24px",borderBottom:"1px solid #fee2e2",
                        cursor:"pointer",display:"flex",alignItems:"flex-start",
                        justifyContent:"space-between",gap:12,
                        transition:"background 0.1s"}}
                      onMouseEnter={e=>e.currentTarget.style.background="#fff5f5"}
                      onMouseLeave={e=>e.currentTarget.style.background="#fff"}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                          <span style={{fontWeight:700,fontSize:13,color:"#b91c1c"}}>{f.opportunity}</span>
                          <span style={{fontSize:12,color:"#4a5568"}}>{f.customer}</span>
                        </div>
                        {f.note&&(
                          <div style={{fontSize:11,color:"#6b7a8d",fontStyle:"italic",marginBottom:2}}>
                            "{f.note}"
                          </div>
                        )}
                        <div style={{fontSize:10,color:"#9aa5b1"}}>
                          Flagged by {f.flagged_by} · {new Date(f.flagged_at).toLocaleDateString("en-US",{month:"short",day:"numeric"})}
                        </div>
                      </div>
                      <span style={{fontSize:11,color:"#b91c1c",flexShrink:0}}>→</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Approval Queue widget (approvers only) ── */}
            {isApprover&&(
              <div style={{background:"#fff",borderRadius:12,boxShadow:"0 1px 4px rgba(0,0,0,0.07)",
                border:"1px solid #e8ecf0",overflow:"hidden",marginBottom:20}}>
                <div style={{padding:"14px 24px",borderBottom:"1px solid #e8ecf0",
                  display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <div style={{fontSize:10,fontWeight:700,letterSpacing:1.5,color:"#9aa5b1"}}>
                    APPROVAL QUEUE
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <button onClick={()=>{setShowRecentApproved(true);if(!recentApproved)loadRecentApproved(recentDays);}}
                      style={{background:"none",border:"1px solid #d0d7de",borderRadius:6,
                        padding:"3px 10px",fontSize:11,cursor:"pointer",color:"#1a5276",fontWeight:600}}>
                      ✓ Recently Approved
                    </button>
                    {pendingQuotes.length>0&&(
                      <span style={{background:"#c0392b",color:"#fff",borderRadius:10,
                        fontSize:10,fontWeight:700,padding:"2px 8px"}}>
                        {pendingQuotes.length} pending
                      </span>
                    )}
                  </div>
                </div>
                {pendingQuotes.length===0?(
                  <div style={{padding:"24px",textAlign:"center",color:"#9aa5b1",fontSize:12}}>
                    ✓ No pending approvals
                  </div>
                ):(
                  <div>
                    {/* Select all */}
                    <div style={{padding:"8px 24px",background:"#f8f9fb",borderBottom:"1px solid #e8ecf0",
                      display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}
                      onClick={()=>{
                        if(qSelected.size===pendingQuotes.length)setQSelected(new Set());
                        else setQSelected(new Set(pendingQuotes.map(q=>String(q.id))));
                      }}>
                      <input type="checkbox" readOnly
                        checked={qSelected.size===pendingQuotes.length&&pendingQuotes.length>0}
                        style={{accentColor:"#6d28d9",width:13,height:13}}/>
                      <span style={{fontSize:10,fontWeight:700,color:"#6b7a8d",letterSpacing:.5}}>SELECT ALL</span>
                    </div>
                    {/* Queue rows */}
                    {pendingQuotes.map(q=>{
                      const sel=qSelected.has(String(q.id));
                      const subAt=q.approval?.submittedAt?new Date(q.approval.submittedAt).toLocaleDateString():"";
                      const isWon=q.wonApproval?.status==="pending_won";
                      return(
                        <div key={q.id}
                          style={{padding:"12px 24px",borderBottom:"1px solid #f0f2f5",
                            background:sel?"#f5f3ff":"#fff",
                            display:"flex",alignItems:"center",gap:12,cursor:"pointer"}}
                          onClick={()=>{
                            const s=new Set(qSelected);
                            if(s.has(String(q.id)))s.delete(String(q.id));
                            else s.add(String(q.id));
                            setQSelected(s);
                          }}>
                          <input type="checkbox" readOnly checked={sel}
                            style={{accentColor:"#6d28d9",width:13,height:13,flexShrink:0,pointerEvents:"none"}}/>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontWeight:600,fontSize:13,color:"#1a2332",marginBottom:2,
                              display:"flex",alignItems:"center",gap:8}}>
                              <span
                                onClick={e=>{e.stopPropagation();onLoadQuote&&onLoadQuote(q);}}
                                style={{color:"#1a5276",cursor:"pointer",textDecoration:"underline",
                                  textDecorationColor:"rgba(26,82,118,0.4)"}}>
                                {q.qi?.opp||q.opp||"(no opp)"}
                              </span>
                              {isWon
                                ?<span style={{fontSize:9,background:"#d1fae5",color:"#065f46",borderRadius:4,padding:"2px 6px",fontWeight:700}}>🏆 CLOSED WON</span>
                                :<span style={{fontSize:9,background:"#ede9fe",color:"#4c1d95",borderRadius:4,padding:"2px 6px",fontWeight:700}}>📋 QUOTE</span>
                              }
                            </div>
                            <div style={{fontSize:11,color:"#6b7a8d",display:"flex",gap:12,flexWrap:"wrap"}}>
                              {(q.qi?.customer||q.customer)&&<span>{q.qi?.customer||q.customer}</span>}
                              {subAt&&<span>Submitted: {subAt}</span>}
                              {(isWon?q.wonApproval?.submittedBy:q.approval?.submittedBy)&&<span>By: {isWon?q.wonApproval.submittedBy:q.approval.submittedBy}</span>}
                            </div>
                          </div>
                          <div style={{fontWeight:700,fontSize:13,color:"#1e8449",flexShrink:0}}>
                            {money(q.total||0)}
                          </div>
                        </div>
                      );
                    })}
                    {/* Action footer */}
                    <div style={{padding:"14px 24px",borderTop:"1px solid #e8ecf0",background:"#f8f9fb"}}>
                      <div style={{marginBottom:10}}>
                        <div style={{fontSize:11,color:"#6b7a8d",fontWeight:600,marginBottom:4}}>
                          COMMENTS (applied to selected decisions)
                        </div>
                        <textarea value={qComments} onChange={e=>setQComments(e.target.value)}
                          placeholder="Optional comments..."
                          style={{width:"100%",height:48,border:"1px solid #d0d7de",borderRadius:7,
                            padding:"6px 10px",fontSize:12,resize:"none",fontFamily:"inherit",
                            boxSizing:"border-box"}}/>
                      </div>
                      <div style={{display:"flex",gap:8,justifyContent:"flex-end",alignItems:"center"}}>
                        {qSelected.size===0&&(
                          <span style={{fontSize:11,color:"#6b7a8d",marginRight:8}}>Select quotes above to act</span>
                        )}
                        <button disabled={qSelected.size===0}
                          onClick={()=>{onQueueDecision("rejected",[...qSelected]);setQSelected(new Set());setQComments("");}}
                          style={{background:qSelected.size===0?"#e8ecf0":"#c0392b",border:"none",borderRadius:7,
                            padding:"7px 18px",color:qSelected.size===0?"#9aa5b1":"#fff",
                            fontWeight:700,fontSize:12,cursor:qSelected.size===0?"default":"pointer"}}>
                          ✗ Reject
                        </button>
                        <button disabled={qSelected.size===0}
                          onClick={()=>{onQueueDecision("approved",[...qSelected]);setQSelected(new Set());setQComments("");}}
                          style={{background:qSelected.size===0?"#e8ecf0":"#1e8449",border:"none",borderRadius:7,
                            padding:"7px 18px",color:qSelected.size===0?"#9aa5b1":"#fff",
                            fontWeight:700,fontSize:12,cursor:qSelected.size===0?"default":"pointer"}}>
                          ✓ Approve
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── AI Quote Assistant ── */}
            {isFollowUpUser&&(
              <div style={{background:"#fff",borderRadius:12,boxShadow:"0 1px 4px rgba(0,0,0,0.07)",
                border:"1px solid #e8ecf0",overflow:"hidden",marginBottom:20}}>                <div style={{padding:"14px 24px",borderBottom:"1px solid #e8ecf0",
                  display:"flex",alignItems:"center",justifyContent:"space-between"}}>                  <div>                    <div style={{fontSize:10,fontWeight:700,letterSpacing:1.5,color:"#9aa5b1"}}>🤖 QUOTE ASSISTANT</div>
                    <div style={{fontSize:11,color:"#9aa5b1",marginTop:2}}>Ask anything about your quotes or follow-ups</div>
                  </div>
                  {aiMessages.length>0&&(
                    <button onClick={()=>setAiMessages([])}
                      style={{background:"none",border:"1px solid #d0d7de",borderRadius:6,
                        padding:"4px 12px",fontSize:11,cursor:"pointer",color:"#6b7a8d"}}>
                      Clear
                    </button>
                  )}
                </div>
                {aiMessages.length>0&&(
                  <div style={{maxHeight:320,overflowY:"auto",padding:"12px 24px",
                    display:"flex",flexDirection:"column",gap:10}}>
                    {aiMessages.map((msg,i)=>(
                      <div key={i} style={{
                        alignSelf:msg.role==="user"?"flex-end":"flex-start",
                        maxWidth:"85%",
                        background:msg.role==="user"?"#1a2332":"#f4f6f9",
                        color:msg.role==="user"?"#fff":"#1a2332",
                        borderRadius:msg.role==="user"?"12px 12px 2px 12px":"12px 12px 12px 2px",
                        padding:"8px 12px",fontSize:12,lineHeight:1.6,
                        whiteSpace:"pre-wrap",wordBreak:"break-word",
                      }}>
                        {msg.content}
                      </div>
                    ))}
                    {aiLoading&&(
                      <div style={{alignSelf:"flex-start",background:"#f4f6f9",
                        borderRadius:"12px 12px 12px 2px",padding:"8px 14px",
                        fontSize:12,color:"#9aa5b1"}}>
                        ●●● thinking...
                      </div>
                    )}
                  </div>
                )}
                <div style={{padding:"12px 24px",borderTop:aiMessages.length>0?"1px solid #e8ecf0":"none",
                  display:"flex",gap:8}}>
                  <input
                    value={aiInput}
                    onChange={e=>setAiInput(e.target.value)}
                    onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();askAI(aiInput);}}}
                    placeholder="Ask about quotes, follow-ups, accounts..."
                    style={{flex:1,fontSize:12,borderRadius:8,border:"1px solid #d0d7de",
                      padding:"8px 12px",outline:"none",fontFamily:"inherit",
                      background:"#f8f9fb",color:"#1a2332"}}
                    disabled={aiLoading}
                  />
                  <button
                    onClick={()=>askAI(aiInput)}
                    disabled={aiLoading||!aiInput.trim()}
                    style={{background:aiLoading||!aiInput.trim()?"#e8ecf0":"#1a2332",
                      border:"none",borderRadius:8,padding:"8px 16px",
                      color:aiLoading||!aiInput.trim()?"#9aa5b1":"#fff",
                      fontSize:12,fontWeight:700,cursor:aiLoading||!aiInput.trim()?"default":"pointer",
                      transition:"all 0.15s"}}>
                    {aiLoading?"...":"Ask"}
                  </button>
                </div>
                {aiMessages.length===0&&(
                  <div style={{padding:"0 24px 14px",display:"flex",flexWrap:"wrap",gap:6}}>
                    {[
                      "Quotes not followed up in 60 days",
                      "Open proposals over $50k",
                      "What does Lockheed have outstanding?",
                      "Who has the most pending quotes?",
                    ].map(q=>(
                      <button key={q} onClick={()=>askAI(q)}
                        style={{background:"#f4f6f9",border:"1px solid #e8ecf0",borderRadius:20,
                          padding:"4px 10px",fontSize:11,cursor:"pointer",color:"#4a5568",
                          transition:"background 0.1s"}}
                        onMouseEnter={e=>e.target.style.background="#e8ecf0"}
                        onMouseLeave={e=>e.target.style.background="#f4f6f9"}>
                        {q}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}


            {/* ── Follow-ups widget ── */}
            {isFollowUpUser&&(
              <div style={{background:"#fff",borderRadius:12,boxShadow:"0 1px 4px rgba(0,0,0,0.07)",
                border:"1px solid #e8ecf0",overflow:"hidden",marginBottom:20}}>
                <div style={{padding:"14px 24px",borderBottom:"1px solid #e8ecf0",
                  display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <div>
                    <div style={{fontSize:10,fontWeight:700,letterSpacing:1.5,color:"#9aa5b1"}}>
                      ✉️ FOLLOW-UPS DUE
                    </div>
                    <div style={{fontSize:11,color:"#9aa5b1",marginTop:2}}>
                      Quotes sent 30+ days ago with no follow-up
                    </div>
                  </div>
                  <button onClick={loadFollowUps}
                    style={{background:"none",border:"1px solid #d0d7de",borderRadius:6,
                      padding:"4px 12px",fontSize:11,cursor:"pointer",color:"#6b7a8d"}}>
                    ↻ Refresh
                  </button>
                </div>
                {fuLoading?(
                  <div style={{padding:24,textAlign:"center",color:"#9aa5b1",fontSize:12}}>Loading…</div>
                ):followUps.length===0?(
                  <div style={{padding:24,textAlign:"center",color:"#9aa5b1",fontSize:12}}>
                    🎉 No follow-ups due right now.
                  </div>
                ):(
                  <div>
                    {followUps.map(fu=>{
                      const daysSinceSent=Math.floor((Date.now()-new Date(fu.sent_at).getTime())/(1000*60*60*24));
                      const isGenerating=fuEmailLoading===fu.id;
                      const emailShown=fuEmail?.id===fu.id;
                      return(
                        <div key={fu.id} style={{borderTop:"1px solid #f0f2f5",padding:"14px 24px"}}>
                          {/* Quote info row */}
                          <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
                            <div>
                              <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                                <span style={{fontWeight:700,fontSize:13,color:"#1a5276"}}>
                                  {fu.opportunity||"—"}
                                </span>
                                <span style={{fontSize:12,color:"#6b7a8d"}}>{fu.customer||"—"}</span>
                                {fu.quotes?.data?.ti?.item&&(
                                  <span style={{fontSize:11,color:"#9aa5b1",fontStyle:"italic"}}>
                                    {fu.quotes.data.ti.item}
                                  </span>
                                )}
                              </div>
                              <div style={{fontSize:11,color:"#9aa5b1",marginTop:3}}>
                                Sent {daysSinceSent} day{daysSinceSent!==1?"s":""} ago by {fu.sent_by}
                                {fu.followup_again_at&&(
                                  <span style={{marginLeft:8,color:"#b7791f"}}>· 90-day reminder</span>
                                )}
                              </div>
                            </div>
                            {/* Action buttons */}
                            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                              <button
                                disabled={isGenerating}
                                onClick={()=>emailShown?setFuEmail(null):generateFollowUpEmail(fu)}
                                style={{background:emailShown?"#eaf2ff":"#1a5276",border:"none",
                                  borderRadius:6,padding:"6px 14px",color:emailShown?"#1a5276":"#fff",
                                  fontWeight:600,fontSize:11,cursor:"pointer",
                                  border:emailShown?"1px solid #1a5276":"none"}}>
                                {isGenerating?"✨ Generating…":emailShown?"✕ Hide Email":"✨ Generate Email"}
                              </button>
                              <button
                                onClick={e=>{e.preventDefault();markFollowedUp(fu.id,false);}}
                                style={{background:"#1e8449",border:"none",borderRadius:6,
                                  padding:"6px 14px",color:"#fff",fontWeight:600,fontSize:11,cursor:"pointer"}}>
                                ✓ Done
                              </button>
                              <button
                                onClick={e=>{e.preventDefault();markFollowedUp(fu.id,true);}}
                                style={{background:"none",border:"1px solid #b7791f",borderRadius:6,
                                  padding:"6px 14px",color:"#b7791f",fontWeight:600,fontSize:11,cursor:"pointer"}}>
                                ↻ Follow up in 90 days
                              </button>
                            </div>
                          </div>
                          {/* Generated email */}
                          {emailShown&&fuEmail&&(
                            <div style={{marginTop:12,background:"#f8f9fb",borderRadius:8,
                              border:"1px solid #e8ecf0",padding:"14px 16px"}}>
                              <div style={{display:"flex",justifyContent:"space-between",
                                alignItems:"center",marginBottom:10}}>
                                <div style={{fontSize:11,fontWeight:700,color:"#9aa5b1",letterSpacing:.8}}>
                                  GENERATED FOLLOW-UP EMAIL
                                </div>
                                <button
                                  onClick={()=>{
                                    navigator.clipboard.writeText(fuEmail.text);
                                  }}
                                  style={{background:"#1a5276",border:"none",borderRadius:5,
                                    padding:"4px 12px",color:"#fff",fontSize:11,fontWeight:600,
                                    cursor:"pointer"}}>
                                  📋 Copy
                                </button>
                              </div>
                              <pre style={{fontSize:12,color:"#1a2332",lineHeight:1.7,
                                whiteSpace:"pre-wrap",fontFamily:"Segoe UI,system-ui,sans-serif",
                                margin:0}}>
                                {fuEmail.text}
                              </pre>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}


            {/* ── Month over month combo chart ── */}
            {(()=>{
              const months = data.monthCounts;
              const maxCount = Math.max(...months.map(m=>m.count), 1);
              const maxTotal = Math.max(...months.map(m=>m.total), 1);
              const W=560, H=160, PAD={t:24,r:60,b:32,l:44};
              const chartW=W-PAD.l-PAD.r, chartH=H-PAD.t-PAD.b;
              const barW=chartW/months.length*0.45;
              const xCenter=i=>PAD.l+(i+0.5)*(chartW/months.length);
              const barX=i=>xCenter(i)-barW/2;
              const barH=v=>Math.max(2,Math.round((v/maxCount)*chartH));
              const lineY=v=>PAD.t+chartH-Math.round((v/maxTotal)*chartH);
              const points=months.map((m,i)=>xCenter(i)+","+lineY(m.total)).join(" ");
              return(
                <div style={{background:"#fff",borderRadius:12,padding:"20px 24px",
                  boxShadow:"0 1px 4px rgba(0,0,0,0.07)",border:"1px solid #e8ecf0",marginBottom:20}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
                    <div style={{fontSize:10,fontWeight:700,letterSpacing:1.5,color:"#9aa5b1"}}>
                      QUOTES — LAST 4 MONTHS
                    </div>
                    <div style={{display:"flex",gap:16,fontSize:10,color:"#6b7a8d"}}>
                      <div style={{display:"flex",alignItems:"center",gap:5}}>
                        <div style={{width:12,height:12,borderRadius:2,background:"#1a5276"}}/>
                        <span>Quote count</span>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:5}}>
                        <div style={{width:16,height:2,background:"#c0392b",borderRadius:1}}/>
                        <span>Total value</span>
                      </div>
                    </div>
                  </div>
                  <svg viewBox={"0 0 "+W+" "+H} style={{width:"100%",height:"auto",overflow:"visible"}}>
                    {/* Y-axis gridlines (count, left) */}
                    {[0,0.25,0.5,0.75,1].map(t=>{
                      const y=PAD.t+chartH*(1-t);
                      return <g key={t}>
                        <line x1={PAD.l} y1={y} x2={PAD.l+chartW} y2={y} stroke="#f0f2f5" strokeWidth="1"/>
                        <text x={PAD.l-6} y={y+4} textAnchor="end" fontSize="9" fill="#9aa5b1">
                          {Math.round(maxCount*t)}
                        </text>
                      </g>;
                    })}
                    {/* Y-axis right (total value) */}
                    {[0,0.5,1].map(t=>{
                      const y=PAD.t+chartH*(1-t);
                      const val=maxTotal*t;
                      const label=val>=1000?"$"+(val/1000).toFixed(0)+"k":"$"+Math.round(val);
                      return <text key={t} x={PAD.l+chartW+8} y={y+4} fontSize="9" fill="#c0392b">{label}</text>;
                    })}
                    {/* Bars */}
                    {months.map((m,i)=>(
                      <g key={m.label}>
                        <rect x={barX(i)} y={PAD.t+chartH-barH(m.count)}
                          width={barW} height={barH(m.count)}
                          fill={m.isCurrent?"#1a5276":"#d0d7de"} rx="3"/>
                        {/* Count label — always just above bar */}
                        <text x={xCenter(i)} y={PAD.t+chartH-barH(m.count)-5}
                          textAnchor="middle" fontSize="10"
                          fontWeight={m.isCurrent?"500":"400"}
                          fill={m.isCurrent?"#1a5276":"#6b7a8d"}>
                          {m.count}
                        </text>
                      </g>
                    ))}
                    {/* Value line — thin */}
                    <polyline points={points} fill="none" stroke="#c0392b" strokeWidth="1.5"
                      strokeLinejoin="round" strokeDasharray="0"/>
                    {/* Value dots + labels — always below dot to avoid colliding with bar count labels above */}
                    {months.map((m,i)=>{
                      const cx=xCenter(i), cy=lineY(m.total);
                      const label=m.total>=1000?"$"+(m.total/1000).toFixed(1)+"k":"$"+Math.round(m.total);
                      // White label on current month bar (red on blue is hard to read)
                      const labelFill=m.isCurrent?"#fff":"#c0392b";
                      return <g key={m.label}>
                        <circle cx={cx} cy={cy} r="3" fill="#c0392b" stroke="#fff" strokeWidth="1.5"/>
                        <text x={cx} y={cy+14} textAnchor="middle" fontSize="9"
                          fill={labelFill} fontWeight="600">
                          {label}
                        </text>
                      </g>;
                    })}
                    {/* X-axis labels */}
                    {months.map((m,i)=>(
                      <text key={m.label} x={xCenter(i)} y={H-6}
                        textAnchor="middle" fontSize="10"
                        fontWeight={m.isCurrent?"500":"400"}
                        fill={m.isCurrent?"#1a5276":"#9aa5b1"}>
                        {m.label}
                      </text>
                    ))}
                  </svg>
                </div>
              );
            })()}

            {/* ── Quotes this month table ── */}
            <div style={{background:"#fff",borderRadius:12,boxShadow:"0 1px 4px rgba(0,0,0,0.07)",
              border:"1px solid #e8ecf0",overflow:"hidden"}}>
              <div style={{padding:"16px 24px",borderBottom:"1px solid #e8ecf0",
                fontSize:10,fontWeight:700,letterSpacing:1.5,color:"#9aa5b1"}}>
                ALL QUOTES THIS MONTH
              </div>
              {data.created.length===0?(
                <div style={{padding:32,textAlign:"center",color:"#9aa5b1",fontSize:13}}>No quotes created this month yet</div>
              ):(
                <>
                  <div style={{display:"grid",gridTemplateColumns:"2fr 2fr 1fr",
                    padding:"8px 24px",background:"#f8f9fb",
                    fontSize:9,fontWeight:700,letterSpacing:.8,color:"#9aa5b1"}}>
                    <div>OPPORTUNITY</div><div>ACCOUNT</div><div style={{textAlign:"right"}}>TOTAL</div>
                  </div>
                  {data.created.map(q=>(
                    <div key={q.id} style={{display:"grid",gridTemplateColumns:"2fr 2fr 1fr",
                      padding:"10px 24px",borderTop:"1px solid #f0f2f5",fontSize:12}}>
                      <div
                        onClick={()=>{
                          if(!onLoadQuote)return;
                          // Hydrate the raw dashboard row into a full quote object for handleLoad
                          const blob=q.data||{};
                          onLoadQuote({
                            ...blob,
                            id:q.id,
                            opp:q.opportunity||blob.opp,
                            rev:q.revision||blob.qi?.rev||blob.rev||"",
                            customer:q.customer||blob.customer,
                            total:q.total||blob.total,
                            source:blob.source||"vibrato",
                            savedAt:q.created_at,
                          });
                        }}
                        style={{fontWeight:600,color:"#1a5276",cursor:"pointer",
                          textDecoration:"underline",textDecorationColor:"rgba(26,82,118,0.4)"}}>
                        {q.opportunity||"—"}
                      </div>
                      <div style={{color:"#6b7a8d"}}>{q.customer||"—"}</div>
                      <div style={{textAlign:"right",fontWeight:600,color:"#1a5276"}}>{money(q.total||0)}</div>
                    </div>
                  ))}
                  <div style={{display:"grid",gridTemplateColumns:"2fr 2fr 1fr",
                    padding:"10px 24px",borderTop:"2px solid #e8ecf0",
                    fontSize:12,fontWeight:700,background:"#f8f9fb"}}>
                    <div style={{color:"#1a2332"}}>Total</div>
                    <div/>
                    <div style={{textAlign:"right",color:"#1a5276"}}>
                      {money(data.created.reduce((a,q)=>a+(q.total||0),0))}
                    </div>
                  </div>
                </>
              )}
            </div>
            {/* ── Top codes + Top accounts ── */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:20}}>

              {/* Top 10 product codes */}
              <div style={{background:"#fff",borderRadius:12,padding:"20px 24px",
                boxShadow:"0 1px 4px rgba(0,0,0,0.07)",border:"1px solid #e8ecf0"}}>
                <div style={{fontSize:10,fontWeight:700,letterSpacing:1.5,color:"#9aa5b1",marginBottom:12}}>
                  TOP PRODUCT CODES THIS MONTH
                </div>
                {data.topCodes.length===0?(
                  <div style={{fontSize:12,color:"#9aa5b1",fontStyle:"italic"}}>No data yet</div>
                ):(
                  <>
                    {data.topCodes.map((p,i)=>{
                      const maxVal = data.topCodes[0].total;
                      return(
                        <div key={p.code} style={{marginBottom:8}}>
                          <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:3}}>
                            <span style={{fontWeight:700,color:"#1a2332"}}>
                              <span style={{color:"#9aa5b1",marginRight:6,fontSize:10}}>#{i+1}</span>
                              {p.code}
                            </span>
                            <span style={{color:"#1a5276",fontWeight:600}}>{money(p.total)}</span>
                          </div>
                          <div style={{height:5,background:"#e8ecf0",borderRadius:3,overflow:"hidden"}}>
                            <div style={{height:"100%",width:Math.round((p.total/maxVal)*100)+"%",
                              background:"#1a5276",borderRadius:3}}/>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>

              {/* Top 5 accounts */}
              <div style={{background:"#fff",borderRadius:12,padding:"20px 24px",
                boxShadow:"0 1px 4px rgba(0,0,0,0.07)",border:"1px solid #e8ecf0"}}>
                <div style={{fontSize:10,fontWeight:700,letterSpacing:1.5,color:"#9aa5b1",marginBottom:12}}>
                  TOP 5 ACCOUNTS THIS MONTH
                </div>
                {data.topAccounts.length===0?(
                  <div style={{fontSize:12,color:"#9aa5b1",fontStyle:"italic"}}>No data yet</div>
                ):(
                  <table style={{width:"100%",borderCollapse:"collapse"}}>
                    <thead>
                      <tr style={{fontSize:9,color:"#9aa5b1",fontWeight:700,letterSpacing:.8}}>
                        <th style={{textAlign:"left",paddingBottom:8,fontWeight:700}}>#</th>
                        <th style={{textAlign:"left",paddingBottom:8,fontWeight:700}}>ACCOUNT</th>
                        <th style={{textAlign:"center",paddingBottom:8,fontWeight:700}}>QUOTES</th>
                        <th style={{textAlign:"right",paddingBottom:8,fontWeight:700}}>TOTAL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topAccounts.map((a,i)=>(
                        <tr key={a.name} style={{borderTop:"1px solid #f0f2f5",fontSize:11}}>
                          <td style={{padding:"7px 0",color:"#9aa5b1",fontWeight:600}}>{i+1}</td>
                          <td style={{padding:"7px 8px",fontWeight:600,color:"#1a2332",
                            maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                            {a.name}
                          </td>
                          <td style={{padding:"7px 0",textAlign:"center",color:"#6b7a8d"}}>{a.count}</td>
                          <td style={{padding:"7px 0",textAlign:"right",fontWeight:600,color:"#1a5276"}}>
                            {money(a.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>



          </div>
        )}
        </div>{/* end privacy-mode wrapper */}
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────


// ── Pricing Calculator sub-components (defined outside to prevent focus loss) ──
function CalcInp({value,onChange,width=70}){
  return <input value={value} onChange={e=>onChange(e.target.value)}
    style={{width,fontSize:11,padding:"3px 6px",borderRadius:5,border:"1px solid #d0d7de",fontFamily:"monospace"}}/>;
}
function CalcSel({value,onChange,options,width=160}){
  return <select value={value} onChange={e=>onChange(e.target.value)}
    style={{fontSize:11,padding:"3px 6px",borderRadius:5,border:"1px solid #d0d7de",width}}>
    {options.map(o=><option key={o} value={o}>{o}</option>)}
  </select>;
}
function CalcRow2({label,children}){
  return <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
    <span style={{fontSize:11,color:"#6b7a8d",minWidth:110}}>{label}</span>
    {children}
  </div>;
}
function CalcResult({setupAmt,testAmt}){
  return <div style={{marginTop:12,padding:"10px 12px",background:"#1a2332",borderRadius:8,display:"flex",gap:24}}>
    {setupAmt!==undefined&&<div>
      <div style={{fontSize:9,color:"rgba(255,255,255,0.5)",letterSpacing:1,marginBottom:2}}>SUGGESTED SETUP</div>
      <div style={{fontSize:16,fontWeight:700,color:"#fff",fontFamily:"monospace"}}>{money(setupAmt)}</div>
    </div>}
    {testAmt!==undefined&&<div>
      <div style={{fontSize:9,color:"rgba(255,255,255,0.5)",letterSpacing:1,marginBottom:2}}>SUGGESTED TESTING</div>
      <div style={{fontSize:16,fontWeight:700,color:"#5dade2",fontFamily:"monospace"}}>{money(testAmt)}</div>
    </div>}
  </div>;
}

function SpecSuggestion({text}){
  const [copied,setCopied]=useState(false);
  if(!text||!text.trim())return null;
  const copy=()=>{
    navigator.clipboard.writeText(text).then(()=>{
      setCopied(true);
      setTimeout(()=>setCopied(false),2000);
    });
  };
  return(
    <div style={{marginTop:10,padding:"8px 10px",background:"#f0f4ff",borderRadius:6,border:"1px solid #c7d4f0"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
        <span style={{fontSize:9,fontWeight:700,color:"#4a6fa5",letterSpacing:1}}>SPEC SUGGESTION</span>
        <button onClick={copy}
          style={{fontSize:9,background:copied?"#276749":"#4a6fa5",color:"#fff",border:"none",
            borderRadius:4,padding:"2px 8px",cursor:"pointer",fontWeight:700}}>
          {copied?"✓ Copied":"📋 Copy"}
        </button>
      </div>
      <pre style={{fontSize:10,color:"#2c3e6b",fontFamily:"monospace",margin:0,whiteSpace:"pre-wrap",lineHeight:1.6}}>{text}</pre>
    </div>
  );
}

// ── Pricing Calculator ────────────────────────────────────────────────────────
function PricingCalculator({setup, ti, onExportEmiF, onExportEmiG, onExportPq300b, onExportPq300p1}){
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("vib");

  // Shared inputs
  const techRate = sf(setup?.techRate,175);
  const fabHours = sf(setup?.fabHours,4);
  const holes    = sf(setup?.holes,0);
  const drillTap = setup?.drillTap||false;
  const drill    = holes*0.5*techRate*(drillTap?1.5:1);
  const fab      = fabHours*techRate;
  const smartBase= (std)=>Math.round(sf(std,0)+drill+fab);

  // Per-tab local state
  const [vib,   setVib]   = useState({std:"900",testing:"3250",pia:"1",spec:"",freqRange:""});
  const [shock, setShock] = useState({cat:"Medium Weight",std:"1500",testing:"4575",fromVib:false,wt:"",pia:"1",spec:"",grade:"",class_:"",type_:"",location:"Hull",blows:""});
  const [noise, setNoise] = useState({chamber:"Speakerbox",level:"<=140dB",durVal:"30",durUnit:"minutes",pia:"1"});
  const [env,   setEnv]   = useState({type:"Temperature & Humidity",thDur:"0 to 1 Day",altDwell:"1-30 min",testing:"1000",std:"500",spec:"",essDur:"10 minutes",thDurVal:"",thDurUnit:"hours"});
  const [hfv,   setHfv]   = useState({std:"500",testing:"1225",pia:"1",dur:"30",spec:""});
  const [sho,   setSho]   = useState({std:"500",testing:"1250",hfvDisc:false,pia:"1",shape:"Half Sine",gLevel:"",pDur:"",nPulses:"",spec:""});
  const [ab,    setAb]    = useState({std:"1000",testing:"2850",pia:"1",spec:""});
  const [sb,    setSb]    = useState({std:"850",testing:"2650",pia:"1",spec:""});

  const TH_PRICES={"0 to 1 Day":1000,"3 Days":1350,"5 Days":1875,"7 Days":2275,"10 Days":2950};
  const NOISE_CHAMBERS={"Speakerbox":1000,"64 Reverb Chamber":1500,"300 Reverb Chamber":2000,"Prog Wave Tube":2750};

  // Weight-based shock testing — uses mwTesting() for source-of-truth tiers
  const wt = sf(shock.wt||ti?.wt,0);
  const isMW = (shock.cat||"Medium Weight")==="Medium Weight";
  const mwsTestPrice = isMW
    ? (wt>0?mwTesting(wt):sf(shock.testing,4575))
    : sf(shock.testing,1450);

  // Vib setup for shock discount
  const vibSetupAmt = smartBase(vib.std);
  const shockSetup = shock.fromVib
    ? (shock.std==="1500"?mwDisc(vibSetupAmt):lwDisc(vibSetupAmt))
    : smartBase(shock.std);

  const TABS=[
    {key:"vib",  label:"Vibration"},
    {key:"shock",label:"Shock"},
    {key:"noise",label:"Noise"},
    {key:"env",  label:"Environmental"},
    {key:"hfv",  label:"HF Vibration"},
    {key:"sho",  label:"Shock (Other)"},
    {key:"ab",   label:"Airborne"},
    {key:"sb",   label:"Structureborne"},
    {key:"emi",  label:"EMI"},
    {key:"pq",   label:"Power Quality"},
    {key:"dcm",  label:"DC Magnetics"},
  ];

  // EMI state
  const [emiCalc,setEmiCalc]=useState({
    spec:"MIL-STD-461",revs:{},plats:{},locs:{},tests:{},
    dimL:"",dimW:"",dimH:"",cables:"",phases:"3",
    rate:String(EMI_SR),setupShifts:"3",tdShifts:"1",rs103amp:"5000",addl:"0",pia:1,
  });
  // PQ state
  const [pqCalc,setPqCalc]=useState({
    rate:String(PQ_SR),phases:"3",setupShifts:"1.5",tdShifts:"1.0",rows:{},cw:false,pia:1,
  });
  // DCM state
  const [dcmCalc,setDcmCalc]=useState({
    spec:"",rate:String(DCM_SR),setupShifts:"1.5",testShifts:"1.0",pia:1,
  });
  const [specText,setSpecText]=useState("");
  const [copyMsg,setCopyMsg]=useState("");

  // EMI shifts computed from calculator state
  const emiShifts=useMemo(()=>calcEmiShifts({
    dimL:emiCalc.dimL||ti?.dimL||"0",
    dimW:emiCalc.dimW||ti?.dimW||"0",
    dimH:emiCalc.dimH||ti?.dimH||"0",
    cables:emiCalc.cables||"0",
    setupCables:setup?.cables||"0",
    phases:emiCalc.phases||ti?.phase||"3",
    revs:emiCalc.revs,
  }),[emiCalc.dimL,emiCalc.dimW,emiCalc.dimH,emiCalc.cables,setup?.cables,emiCalc.phases,emiCalc.revs,ti?.dimL,ti?.dimW,ti?.dimH,ti?.phase]);

  const emiRate=sf(emiCalc.rate,EMI_SR);
  const emiSelTests=Object.entries(emiCalc.tests||{}).filter(([,v])=>v).map(([k])=>k);
  const emiTestShifts=emiSelTests.reduce((a,t)=>a+(emiShifts[t]?.rounded||0),0);
  const rs103Cost=emiSelTests.includes("RS103")?sf(emiCalc.rs103amp,5000):0;
  const emiSetupCost=r25(sf(emiCalc.setupShifts,3)*emiRate*sf(emiCalc.pia,1));
  // Suggested EMI setup based on cables + weight
  // Base: 1 shift; +1hr per cable; tier bumps at 6/10/15/20 cables; weight multipliers ≥800lb / ≥1500lb
  const suggSetup=useMemo(()=>{
    const cablesEff=Math.max(0,sf(emiCalc.cables,0)>0?sf(emiCalc.cables,0):sf(setup?.cables,0));
    const wt=sf(emiCalc.weight||ti?.wt,0);
    const baseHrs=8 + cablesEff*1; // 1 shift + 1 hr per cable
    let tierBumpShifts=0;
    if(cablesEff>=6)  tierBumpShifts+=1;
    if(cablesEff>=10) tierBumpShifts+=1;
    if(cablesEff>=15) tierBumpShifts+=1;
    if(cablesEff>=20) tierBumpShifts+=2;
    let totalHrs=baseHrs + tierBumpShifts*8;
    let wtMult=1.0, wtNote='';
    if(wt>=1500){ wtMult=1.20; wtNote=' incl. +20% over 1500 lb'; }
    else if(wt>=800){ wtMult=1.10; wtNote=' incl. +10% over 800 lb'; }
    totalHrs *= wtMult;
    const shifts=Math.ceil(totalHrs/8);
    const cost=r25(shifts*emiRate*sf(emiCalc.pia,1));
    return {shifts, cost, cablesEff, wt, wtNote, totalHrs};
  },[emiCalc.cables,setup?.cables,emiCalc.weight,ti?.wt,emiRate,emiCalc.pia]);
  const emiTestCost=r25((emiTestShifts*emiRate+rs103Cost)*sf(emiCalc.pia,1));
  const emiTdCost=r25(sf(emiCalc.tdShifts,1)*emiRate);

  // PQ computed
  const PQ_P1=[
    {key:"5.3.1",label:"Grounding (susceptibility) test",sh:0.5,sh3p:null},
    {key:"5.3.2",label:"User equipment power profile test",sh:1.0,sh3p:null},
    {key:"5.3.3",label:"Voltage and frequency maximum departure tolerance test",sh:1.0,sh3p:null},
    {key:"5.3.4",label:"Voltage and frequency transient tolerance and recovery test",sh:1.0,sh3p:null},
    {key:"5.3.5",label:"Voltage spike (susceptibility) test",sh:1.5,sh3p:2.0},
    {key:"5.3.6",label:"Emergency conditions (susceptibility) test",sh:2.0,sh3p:null},
    {key:"5.3.7",label:"Current waveform (emission) test",sh:0.75,sh3p:1.0},
    {key:"5.3.8",label:"Voltage and frequency modulation test",sh:2.0,sh3p:null},
    {key:"5.3.9",label:"Simulated human body impedance ground current test",sh:0.75,sh3p:null},
    {key:"5.3.10.1",label:"Equipment line-to-ground voltage test",sh:0.5,sh3p:null},
    {key:"5.3.10.2",label:"Equipment line-to-ground voltage test (AGD)",sh:0.5,sh3p:null},
  ];
  const PQ_300B=[
    {key:"B5.3.1",label:"Voltage and frequency tolerance test",sh:1.0,sh3p:null},
    {key:"B5.3.2",label:"Voltage and frequency transient tolerance and recovery test",sh:1.0,sh3p:null},
    {key:"B5.3.3",label:"Voltage spike test",sh:1.5,sh3p:2.0},
    {key:"B5.3.4",label:"Emergency condition test",sh:2.0,sh3p:null},
    {key:"B5.3.5",label:"Grounding test",sh:0.5,sh3p:null},
    {key:"B5.3.6",label:"User equipment power profile test",sh:1.0,sh3p:null},
    {key:"B5.3.7",label:"Current waveform test",sh:0.75,sh3p:1.0},
    {key:"B5.3.8",label:"Voltage and frequency modulation test",sh:2.0,sh3p:null},
    {key:"B5.3.9",label:"Simulated human body leakage current test",sh:0.75,sh3p:null},
    {key:"B5.3.10.1",label:"Equipment insulation resistance test",sh:0.5,sh3p:null},
    {key:"B5.3.10.2",label:"Active ground detection test",sh:0.5,sh3p:null},
  ];
  const pqIs3ph=sf(pqCalc.phases||3,3)>=3;
  const getShifts=r=>pqIs3ph&&r.sh3p!=null?r.sh3p:r.sh;
  const pqRate=sf(pqCalc.rate,PQ_SR);
  const p1Shifts=PQ_P1.reduce((a,r)=>a+(pqCalc.rows?.[r.key]?getShifts(r):0),0);
  const b3Shifts=PQ_300B.reduce((a,r)=>a+(pqCalc.rows?.[r.key]?getShifts(r):0),0);
  const pqTotalShifts=p1Shifts+b3Shifts;
  const pqSetupCost=r25(sf(pqCalc.setupShifts,1.5)*pqRate*sf(pqCalc.pia,1));
  const pqTestCost=r25(pqTotalShifts*pqRate*sf(pqCalc.pia,1));
  const pqTdCost=r25(sf(pqCalc.tdShifts,1.0)*pqRate);

  // DCM computed
  const dcmRate=sf(dcmCalc.rate,DCM_SR);
  const dcmTotal=r25((sf(dcmCalc.setupShifts,1.5)+sf(dcmCalc.testShifts,1.0))*dcmRate*sf(dcmCalc.pia,1));

  const EMI_NOTES="EMI Notes:\n* This quote assumes that the susceptibility criteria can be determined in less than 3 seconds during real-time operation of the EUT, and that if additional monitoring personnel are needed, they would be provided by the customer. Customer to supply cables and all peripheral and monitoring equipment, and one mode of operation (operating or standby). Susceptibility determination provided by the customer. Pricing is based on customer-supplied information, the assumptions listed here, and acceptance of an approved test procedure.\n* Pricing and feasibility may be reevaluated upon completion and review of the NU Laboratories Test Configuration Form.\n* This quote assumes that the number of cables and outside diameter of the cables under test are within NU Laboratories capabilities/limitations.\n* Pricing assumes the standard list of tests from MIL-STD-461G, and that all testing is performed at NU Labs. Any tests requiring subcontracting will incur additional charges.";

  const copyToClipboard=(text)=>{
    navigator.clipboard.writeText(text).then(()=>{setCopyMsg("Copied!");setTimeout(()=>setCopyMsg(""),2000);});
  };



  // CalcInp, CalcSel, CalcRow2, CalcResult are defined outside as stable components

  const SmartNote=({label})=>(
    <div style={{fontSize:9,color:"#9aa5b1",marginBottom:8}}>
      ↳ Setup reads from form: tech rate ${techRate}/hr, {fabHours}h fab{holes>0?`, ${holes} holes`:""}
      {drill>0?` (+$${Math.round(drill).toLocaleString()} drill)`:""}
      {fab>0?` (+$${Math.round(fab).toLocaleString()} fab)`:""}
    </div>
  );

  return(
    <div style={{marginTop:10,border:"1px solid #e0e4ea",borderRadius:10,overflow:"hidden",fontFamily:"Segoe UI,system-ui,sans-serif"}}>
      {/* Header */}
      <div style={{background:"#f8f9fb",padding:"8px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",
        cursor:"pointer",borderBottom:open?"1px solid #e0e4ea":"none"}}
        onClick={()=>setOpen(v=>!v)}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:12,fontWeight:700,color:"#1a2332",letterSpacing:.2}}>Pricing Calculator</span>
          <span style={{fontSize:10,color:"#9aa5b1"}}>— reference tool, does not affect quote</span>
        </div>
        <span style={{fontSize:12,color:"#9aa5b1"}}>{open?"▲":"▼"}</span>
      </div>

      {open&&(
        <div style={{padding:"12px 14px",background:"#fff"}}>
          {/* Tabs */}
          <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:12}}>
            {TABS.map(t=>(
              <button key={t.key} onClick={()=>setTab(t.key)}
                style={{fontSize:10,fontWeight:tab===t.key?700:400,padding:"4px 10px",borderRadius:20,
                  border:"1px solid "+(tab===t.key?"#1a2332":"#d0d7de"),
                  background:tab===t.key?"#1a2332":"#fff",
                  color:tab===t.key?"#fff":"#6b7a8d",cursor:"pointer"}}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Vibration */}
          {tab==="vib"&&(
            <div>
              <SmartNote/>
              <CalcRow2 label="Spec"><CalcInp value={vib.spec||""} onChange={v=>setVib(s=>({...s,spec:v}))} width={150}/></CalcRow2>
              <CalcRow2 label="Freq Range">
                <CalcInp value={vib.freqRange||""} onChange={v=>setVib(s=>({...s,freqRange:v}))} width={80}/>
                <span style={{fontSize:10,color:"#9aa5b1",marginLeft:4}}>Hz</span>
              </CalcRow2>
              <CalcRow2 label="Std Setup Base ($)"><CalcInp value={vib.std} onChange={v=>setVib(s=>({...s,std:v}))}/></CalcRow2>
              <CalcRow2 label="Testing ($)"><CalcInp value={vib.testing} onChange={v=>setVib(s=>({...s,testing:v}))}/></CalcRow2>
              <CalcRow2 label="PIA Multiplier"><CalcInp value={vib.pia} onChange={v=>setVib(s=>({...s,pia:v}))} width={50}/></CalcRow2>
              <CalcResult setupAmt={Math.round(smartBase(vib.std)*sf(vib.pia,1))} testAmt={Math.round(sf(vib.testing)*sf(vib.pia,1))}/>
              <SpecSuggestion text={(()=>{
                const sc=s=>s?" in accordance with "+s:"";
                const fp=vib.freqRange?", "+vib.freqRange+" Hz":"";
                return vib.spec?"Type I Vibration"+sc(vib.spec)+fp+".":"";
              })()}/>
            </div>
          )}
          {tab==="shock"&&(()=>{
            const wt=sf(shock.wt||ti?.wt,0);
            const isMW=(shock.cat||"Medium Weight")==="Medium Weight";
            const mwsTestPrice=isMW
              ?(wt>0?mwTesting(wt):sf(shock.testing,4575))
              :sf(shock.testing,1450);
            const shockSetup=shock.fromVib?Math.ceil(smartBase(shock.std)*0.75/25)*25:smartBase(shock.std);
            return(
              <div>
                <SmartNote/>
                <CalcRow2 label="Spec"><CalcInp value={shock.spec||""} onChange={v=>setShock(s=>({...s,spec:v}))} width={150}/></CalcRow2>
                <CalcRow2 label="Weight Class">
                  <CalcSel value={shock.cat||"Medium Weight"} width={150}
                    onChange={v=>setShock(s=>({...s,cat:v,std:v==="Medium Weight"?"1500":"900",testing:v==="Medium Weight"?"4575":"1450"}))}
                    options={["Medium Weight","Lightweight"]}/>
                </CalcRow2>
                <CalcRow2 label="Grade"><CalcInp value={shock.grade||""} onChange={v=>setShock(s=>({...s,grade:v}))} width={60}/></CalcRow2>
                <CalcRow2 label="Class"><CalcInp value={shock.class_||""} onChange={v=>setShock(s=>({...s,class_:v}))} width={60}/></CalcRow2>
                <CalcRow2 label="Type"><CalcInp value={shock.type_||""} onChange={v=>setShock(s=>({...s,type_:v}))} width={60}/></CalcRow2>
                <CalcRow2 label="Location">
                  <CalcSel value={shock.location||"Hull"} onChange={v=>setShock(s=>({...s,location:v}))} width={180}
                    options={["Hull","Deck","Hull/Deck","Conventional Deck","Mitigated Deck","Isolated Deck","Shell","Wetted-Surface","Frame"]}/>
                </CalcRow2>
                <CalcRow2 label="# Blows"><CalcInp value={shock.blows||""} onChange={v=>setShock(s=>({...s,blows:v}))} width={60}/></CalcRow2>
                {isMW&&(
                  <CalcRow2 label="Unit Weight (lbs)">
                    <CalcInp value={shock.wt} onChange={v=>setShock(s=>({...s,wt:v}))} width={70}/>
                    {wt>0&&<span style={{fontSize:10,color:"#5dade2",marginLeft:6}}>→ ${mwsTestPrice.toLocaleString()}</span>}
                  </CalcRow2>
                )}
                <CalcRow2 label="From Vib?">
                  <input type="checkbox" checked={shock.fromVib||false} onChange={e=>setShock(s=>({...s,fromVib:e.target.checked}))}/>
                  <span style={{fontSize:10,color:"#9aa5b1",marginLeft:4}}>25% disc on setup</span>
                </CalcRow2>
                <CalcRow2 label="PIA Multiplier"><CalcInp value={shock.pia} onChange={v=>setShock(s=>({...s,pia:v}))} width={50}/></CalcRow2>
                <CalcResult setupAmt={Math.round(shockSetup*sf(shock.pia,1))} testAmt={Math.round(mwsTestPrice*sf(shock.pia,1))}/>
                <SpecSuggestion text={(()=>{
                  const sc=s=>s?" in accordance with "+s:"";
                  const parts=[];
                  if(shock.grade)parts.push("Grade "+shock.grade);
                  if(shock.class_)parts.push("Class "+shock.class_);
                  if(shock.type_)parts.push("Type "+shock.type_);
                  const loc=shock.location||"Hull";
                  parts.push(loc+" Mounted");
                  if(shock.blows)parts.push(shock.blows+" blows");
                  const det=parts.length?", "+parts.join(", "):"";
                  return (shock.cat||"Medium Weight")+" Shock"+sc(shock.spec)+det+".";
                })()}/>
              </div>
            );
          })()}
          {tab==="noise"&&(()=>{
            const COMP_COST_CALC={"<=140dB":0,"145dB":750,"150dB":1500,"155dB":2500,"160dB":2500,"165dB":3500,"170dB":3500};
            const isPWT=noise.chamber==="Prog Wave Tube";
            const lvl=noise.level||"<=140dB";
            const compCost=isPWT?3500:(COMP_COST_CALC[lvl]||0);
            const compMarkup=Math.round(compCost*1.25);
            const durVal=noise.durVal||"30";
            const durUnit=noise.durUnit||"minutes";
            const autoTestCalc=noiseTestingPrice(durVal,durUnit,lvl,compCost);
            const chamberSetupCalc=NOISE_CHAMBERS[noise.chamber]||1000;
            const L=sf(ti?.dimL,0),W=sf(ti?.dimW,0),H=sf(ti?.dimH,0);
            const cuIn=L*W*H; const cuFt=cuIn/1728;
            const dbNum=lvl==="<=140dB"?140:parseInt(lvl)||0;
            const fitsSpkr=cuIn>0&&cuIn<=500&&dbNum<=145;
            const fits64=cuIn>0&&cuFt<=6.4;
            const fits300=cuIn>0&&cuFt<=30&&dbNum<=165;
            const fitsPWT=cuIn>0&&H<=40&&W<=40&&dbNum<=165;
            const rec=cuIn>0?(fitsSpkr?"Speakerbox":fits64?"64 Reverb Chamber":fits300?"300 Reverb Chamber":"Prog Wave Tube"):"";
            const chamberOk=!cuIn||(noise.chamber==="Speakerbox"?fitsSpkr:noise.chamber==="64 Reverb Chamber"?fits64:noise.chamber==="300 Reverb Chamber"?fits300:fitsPWT);
            const base30=NOISE_BASE_30[lvl]||0;
            const base60=NOISE_BASE_60[lvl]||0;
            const raw=parseFloat(durVal)||0;
            const totalHrs=durUnit==="hours"?Math.ceil(raw):raw<=30?null:Math.ceil(raw/60);
            const BLOCK=40;
            const mathLines=[];
            if(totalHrs===null||totalHrs<=0){
              mathLines.push("≤30 min → base (30-min rate): $"+base30.toLocaleString());
            } else if(totalHrs<=1){
              mathLines.push("≤1 hr → base (60-min rate): $"+base60.toLocaleString());
            } else {
              const fullBlocks=Math.floor((totalHrs-1)/BLOCK);
              const remaining=totalHrs-(fullBlocks*BLOCK);
              const extraHrs=remaining-1;
              const blockCost=remaining>20?extraHrs*375:extraHrs*500;
              const rateLabel=remaining>20?"$375/hr (>20h rate)":"$500/hr";
              if(fullBlocks===0){
                mathLines.push("Base (1 hr): $"+base60.toLocaleString());
                if(extraHrs>0){
                  if(remaining>20) mathLines.push("Hours 2–"+remaining+" (block >20h → all at $375/hr): +$"+blockCost.toLocaleString());
                  else mathLines.push("Hours 2–"+remaining+" ($500/hr): +$"+blockCost.toLocaleString());
                }
              } else {
                mathLines.push("Full 40-hr blocks: "+(fullBlocks+1)+" × $"+base60.toLocaleString()+" = $"+((fullBlocks+1)*base60).toLocaleString());
                mathLines.push("  Note: blocks ≤20 extra hrs → $500/hr; blocks >20 extra hrs → all $375/hr");
                if(remaining>1){
                  mathLines.push("Final block ("+remaining+" hrs): base $"+base60.toLocaleString());
                  mathLines.push("  Hours 2–"+remaining+" ("+rateLabel+"): +$"+blockCost.toLocaleString());
                }
              }
            }
            if(compMarkup>0) mathLines.push("Compressor markup ("+compCost.toLocaleString()+" × 1.25): +$"+compMarkup.toLocaleString());
            return(
              <div>
                <CalcRow2 label="Spec">
                  <CalcInp value={noise.spec||""} onChange={v=>setNoise(s=>({...s,spec:v}))} width={200}/>
                </CalcRow2>
                {!(noise.spec||"").trim()&&(
                  <div style={{fontSize:10,color:"#c0392b",marginTop:-4,marginBottom:6,marginLeft:120}}>⚠ Spec required for spec suggestion text</div>
                )}
                <CalcRow2 label="Chamber">
                  <CalcSel value={noise.chamber} onChange={v=>setNoise(s=>({...s,chamber:v}))}
                    options={Object.keys(NOISE_CHAMBERS)} width={200}/>
                </CalcRow2>
                {rec&&(
                  <div style={{fontSize:10,borderRadius:5,padding:"4px 8px",marginBottom:6,
                    background:chamberOk?"#f0fdf4":"#fdf3f2",color:chamberOk?"#15803d":"#dc2626"}}>
                    {chamberOk?"✓ "+noise.chamber+" is appropriate":"⚠ Recommended: "+rec+" — "+noise.chamber+" may not be suitable"}
                  </div>
                )}
                <CalcRow2 label="OASPL Level">
                  <CalcSel value={lvl} onChange={v=>setNoise(s=>({...s,level:v}))}
                    options={["<=140dB","145dB","150dB","155dB","160dB","165dB","170dB"]} width={120}/>
                </CalcRow2>
                <CalcRow2 label="Test OASPL (dB)">
                  <CalcInp value={noise.testOaspl||""} onChange={v=>setNoise(s=>({...s,testOaspl:v}))} width={70}/>
                </CalcRow2>
                {!(noise.testOaspl||"").toString().trim()&&(
                  <div style={{fontSize:10,color:"#c0392b",marginTop:-4,marginBottom:6,marginLeft:120}}>⚠ Test OASPL required for spec suggestion text</div>
                )}
                <CalcRow2 label="Duration">
                  <CalcInp value={noise.durVal||"30"} onChange={v=>setNoise(s=>({...s,durVal:v}))} width={55}/>
                  <CalcSel value={noise.durUnit||"minutes"} onChange={v=>setNoise(s=>({...s,durUnit:v}))}
                    options={["minutes","hours"]} width={90}/>
                </CalcRow2>
                {compCost>0&&(
                  <div style={{fontSize:10,color:"#b45309",background:"#fffbeb",borderRadius:5,padding:"4px 8px",marginBottom:6}}>
                    {isPWT?"Prog Wave Tube always requires":"Level requires"} compressor: ${compCost.toLocaleString()} → ${compMarkup.toLocaleString()} marked up
                  </div>
                )}
                <CalcRow2 label="PIA Multiplier"><CalcInp value={noise.pia} onChange={v=>setNoise(s=>({...s,pia:v}))} width={50}/></CalcRow2>
                <CalcResult setupAmt={Math.round(chamberSetupCalc*sf(noise.pia,1))} testAmt={Math.round(autoTestCalc*sf(noise.pia,1))}/>
                {mathLines.length>0&&(
                  <div style={{marginTop:8,padding:"8px 10px",background:"#f8f9fb",borderRadius:6,border:"1px solid #e8ecf0"}}>
                    <div style={{fontSize:9,fontWeight:700,color:"#9aa5b1",letterSpacing:1,marginBottom:4}}>CALCULATION BREAKDOWN</div>
                    {mathLines.map((l,i)=>(
                      <div key={i} style={{fontSize:10,color:"#9aa5b1",fontFamily:"monospace",lineHeight:1.6}}>{l}</div>
                    ))}
                    <div style={{fontSize:10,color:"#6b7a8d",fontWeight:700,borderTop:"1px solid #e8ecf0",marginTop:4,paddingTop:4,fontFamily:"monospace"}}>
                      Total: ${autoTestCalc.toLocaleString()}
                      {sf(noise.pia,1)>1?" × "+noise.pia+" PIA = $"+Math.round(autoTestCalc*sf(noise.pia,1)).toLocaleString():""}
                    </div>
                  </div>
                )}
                <SpecSuggestion text={(()=>{
                  const specVal=(noise.spec||"").trim();
                  const oasplVal=(noise.testOaspl||"").toString().trim();
                  if(!specVal||!oasplVal)return ""; // hide suggestion until both required fields filled
                  const dur=(noise.durVal&&noise.durUnit)?" for "+noise.durVal+" "+noise.durUnit:"";
                  return "Noise Susceptibility testing in accordance with "+specVal+", "+oasplVal+" dB OASPL"+dur+".";
                })()}/>
                <SpecSuggestion text={"Frequencies below 100 Hz are to be performed as a best effort. All cabling connecting to the EUT should be a minimum of 20' long."}/>
                {lvl==="170dB"&&(
                  <SpecSuggestion text={"OASPL's above 170dB are to be performed as a best effort"}/>
                )}
              </div>
            );
          })()}
          {/* Environmental */}
          {tab==="env"&&(()=>{
            const isTH=["Temperature & Humidity","Temperature Only","Humidity Only"].includes(env.type);
            const isAlt=env.type==="Altitude";
            const isAcc=env.type==="Acceleration";
            const isIncl=env.type==="Inclination";
            const isESS=env.type==="ESS";
            const typeToKey={
              "Temperature & Humidity":"th","Temperature Only":"th","Humidity Only":"th",
              "Altitude":"alt","Salt Fog":"sf","ESS":"ess","Rapid Decompression":"rd",
              "Explosive Decompression":"ed","Acceleration":"acc","Inclination":"incl",
              "Drip Test":"drip","Submergence":"sub","Spray Test":"spray",
              "Insulation Resistance":"insres",
            };
            const ENV_BASE_PRICING={
              th:{setup:500,testing:null},sf:{setup:0,testing:1750},alt:{setup:500,testing:null},
              ess:{setup:0,testing:1000},acc:{setup:null,testing:1950},incl:{setup:null,testing:1750},
              rd:{setup:1000,testing:2275},ed:{setup:1250,testing:2450},drip:{setup:500,testing:750},
              sub:{setup:500,testing:750},spray:{setup:1250,testing:1250},insres:{setup:0,testing:500},
            };
            const envKey=typeToKey[env.type]||"alt";
            const base=ENV_BASE_PRICING[envKey]||{setup:500,testing:1000};
            const smartSetupAmt=(isAcc||isIncl)?Math.round(sf(isAcc?"2000":"1250",0)+drill+fab):base.setup;
            const ALT_DWELL_PRICES={"1-30 min":1000,"31-60 min":1500,"1-2 hr":2275};
            const altTestAmt=ALT_DWELL_PRICES[env.altDwell||"1-30 min"]||1000;
            const testAmt=isTH?(ENV_TH_PRICES[env.thDur]||1000):isAlt?altTestAmt:(base.testing||1000);
            const setupAmt=smartSetupAmt;
            // Build spec suggestion
            const specLines=[];
            if(env.spec) specLines.push("Spec: "+env.spec);
            if(isTH){
              specLines.push("Test Type: "+env.type);
              if(env.thDurVal) specLines.push("Duration: "+env.thDurVal+" "+(env.thDurUnit||"hours"));
              else specLines.push("Duration: "+env.thDur);
            } else if(isAlt){
              specLines.push("Altitude Testing");
              specLines.push("Dwell: "+env.altDwell);
            } else if(isESS){
              specLines.push("Environmental Stress Screening (ESS)");
              if(env.essDur) specLines.push("Duration/Axis: "+env.essDur);
            } else {
              specLines.push(env.type);
            }
            return(
              <div>
                <CalcRow2 label="Test Type">
                  <CalcSel value={env.type} onChange={v=>setEnv(s=>({...s,type:v}))} width={220}
                    options={["Temperature & Humidity","Temperature Only","Humidity Only","Altitude","Salt Fog","ESS","Rapid Decompression","Explosive Decompression","Acceleration","Inclination","Drip Test","Submergence","Spray Test","Insulation Resistance"]}/>
                </CalcRow2>
                <CalcRow2 label="Spec"><CalcInp value={env.spec||""} onChange={v=>setEnv(s=>({...s,spec:v}))} width={150}/></CalcRow2>
                {isTH&&(<>
                  <CalcRow2 label="T&H Type">
                    <CalcSel value={env.thType||"Temperature & Humidity"} onChange={v=>setEnv(s=>({...s,thType:v}))}
                      options={["Temperature & Humidity","Temperature Only","Humidity Only"]} width={200}/>
                  </CalcRow2>
                  <CalcRow2 label="Duration (preset)">
                    <CalcSel value={env.thDur||"0 to 1 Day"} onChange={v=>setEnv(s=>({...s,thDur:v}))}
                      options={Object.keys(ENV_TH_PRICES)} width={130}/>
                    <span style={{fontSize:10,color:"#5dade2",marginLeft:6}}>→ ${(ENV_TH_PRICES[env.thDur||"0 to 1 Day"]||1000).toLocaleString()}</span>
                  </CalcRow2>
                  <CalcRow2 label="Custom Duration">
                    <CalcInp value={env.thDurVal||""} onChange={v=>setEnv(s=>({...s,thDurVal:v}))} width={55}/>
                    <CalcSel value={env.thDurUnit||"hours"} onChange={v=>setEnv(s=>({...s,thDurUnit:v}))}
                      options={["minutes","hours","days"]} width={90}/>
                    <span style={{fontSize:9,color:"#9aa5b1",marginLeft:4}}>spec text only</span>
                  </CalcRow2>
                </>)}
                {isAlt&&(
                  <CalcRow2 label="Dwell Time">
                    <CalcSel value={env.altDwell||"1-30 min"} onChange={v=>setEnv(s=>({...s,altDwell:v}))}
                      options={["1-30 min","31-60 min","1-2 hr"]} width={120}/>
                    <span style={{fontSize:10,color:"#5dade2",marginLeft:6}}>→ ${altTestAmt.toLocaleString()}</span>
                  </CalcRow2>
                )}
                {isESS&&(
                  <CalcRow2 label="Duration/Axis">
                    <CalcInp value={env.essDur||"10 minutes"} onChange={v=>setEnv(s=>({...s,essDur:v}))} width={120}/>
                  </CalcRow2>
                )}
                {(isAcc||isIncl)&&(
                  <div style={{fontSize:9,color:"#9aa5b1",marginBottom:6,padding:"4px 8px",background:"#f8f9fb",borderRadius:5}}>
                    Setup: base ${isAcc?"$2,000":"$1,250"} + ${Math.round(fab).toLocaleString()} fab + ${Math.round(drill).toLocaleString()} drill
                  </div>
                )}
                <CalcResult setupAmt={setupAmt>0?setupAmt:undefined} testAmt={testAmt}/>
                <SpecSuggestion text={(()=>{
                  const sc=s=>s?" in accordance with "+s:"";
                  const sp=env.spec||"";
                  if(isTH){
                    const thMap={"Temperature & Humidity":"Temperature & Humidity","Temperature Only":"Temperature","Humidity Only":"Humidity"};
                    const t=thMap[env.thType||"Temperature & Humidity"]||"Temperature & Humidity";
                    const customDur=env.thDurVal?(env.thDurVal+" "+(env.thDurUnit||"hours")):env.thDur||"";
                    const dur=customDur?", "+customDur:"";
                    return t+" testing"+sc(sp)+dur+".";
                  } else if(isAlt){
                    const dw=env.altDwell?", "+env.altDwell+" dwell":"";
                    return "Altitude testing"+sc(sp)+dw+".";
                  } else if(isESS){
                    const dur=env.essDur||"10 minutes";
                    return "ESS testing"+sc(sp)+", "+dur+" per axis.";
                  } else if(env.type==="Salt Fog") return "Salt Fog testing"+sc(sp)+".";
                  else if(env.type==="Acceleration") return "Acceleration testing"+sc(sp)+".";
                  else if(env.type==="Inclination") return "Inclination testing"+sc(sp)+".";
                  else if(env.type==="Rapid Decompression") return "Rapid Decompression testing"+sc(sp)+".";
                  else if(env.type==="Explosive Decompression") return "Explosive Decompression testing"+sc(sp)+".";
                  else if(env.type==="Drip Test") return "Drip Test"+sc(sp)+".";
                  else if(env.type==="Submergence") return "Submergence testing"+sc(sp)+".";
                  else if(env.type==="Spray Test") return "Spray Test"+sc(sp)+".";
                  else if(env.type==="Insulation Resistance") return "Insulation Resistance"+sc(sp)+".";
                  return env.type+" testing"+sc(sp)+".";
                })()}/>
              </div>
            );
          })()}
          {tab==="hfv"&&(()=>{
            const durMin=sf(hfv.dur||"30",30);
            const autoTest=hfvTestingPrice(durMin);
            const hrs=durMin/60;
            const setupAmt=Math.round(smartBase(hfv.std)*sf(hfv.pia,1));
            const testAmt=Math.round(autoTest*sf(hfv.pia,1));
            return(
              <div>
                <SmartNote/>
                <CalcRow2 label="Spec"><CalcInp value={hfv.spec||""} onChange={v=>setHfv(s=>({...s,spec:v}))} width={150}/></CalcRow2>
                <CalcRow2 label="Std Setup Base ($)"><CalcInp value={hfv.std} onChange={v=>setHfv(s=>({...s,std:v}))}/></CalcRow2>
                <CalcRow2 label="Duration/Axis (min)">
                  <CalcInp value={hfv.dur||"30"} onChange={v=>setHfv(s=>({...s,dur:v}))} width={55}/>
                  <span style={{fontSize:10,color:"#5dade2",marginLeft:6}}>→ ${autoTest.toLocaleString()}/axis</span>
                </CalcRow2>
                <div style={{fontSize:9,color:"#9aa5b1",marginBottom:6,padding:"4px 8px",background:"#f8f9fb",borderRadius:5,fontFamily:"monospace"}}>
                  {hrs<=1?"≤60 min: $1,225":hrs<=3?"1–3 hr: $1,225 + $750×"+(hrs-1).toFixed(2)+"h":"3+ hr: $1,225 + $1,500 + $525×"+(hrs-3).toFixed(2)+"h"}
                  {" = $"+autoTest.toLocaleString()+" per axis"}
                </div>
                <CalcRow2 label="PIA Multiplier"><CalcInp value={hfv.pia} onChange={v=>setHfv(s=>({...s,pia:v}))} width={50}/></CalcRow2>
                <CalcResult setupAmt={setupAmt} testAmt={testAmt}/>
                <SpecSuggestion text={(()=>{
                  const sc=s=>s?" in accordance with "+s:"";
                  return "Vibration testing"+sc(hfv.spec)+", tested for "+(hfv.dur||"30")+" minutes per axis.";
                })()}/>
              </div>
            );
          })()}
          {tab==="sho"&&(()=>{
            const hfvDiscount=sho.hfvDisc;
            const baseSetup=smartBase(sho.std);
            const setupAmt=hfvDiscount?Math.ceil(baseSetup*0.75/25)*25:baseSetup;
            const testAmt=Math.round(sf(sho.testing,1250)*sf(sho.pia,1));
            const setupAmtPIA=Math.round(setupAmt*sf(sho.pia,1));
            return(
              <div>
                <SmartNote/>
                <CalcRow2 label="Pulse Shape">
                  <CalcSel value={sho.shape||"Half Sine"} onChange={v=>setSho(s=>({...s,shape:v}))}
                    options={["Half Sine","Sawtooth","Bench Handling","Drop Shock"]} width={150}/>
                </CalcRow2>
                <CalcRow2 label="G Level">
                  <CalcInp value={sho.gLevel||""} onChange={v=>setSho(s=>({...s,gLevel:v}))} width={70}/>
                </CalcRow2>
                <CalcRow2 label="Pulse Duration (ms)">
                  <CalcInp value={sho.pDur||""} onChange={v=>setSho(s=>({...s,pDur:v}))} width={70}/>
                </CalcRow2>
                <CalcRow2 label="# Pulses">
                  <CalcInp value={sho.nPulses||""} onChange={v=>setSho(s=>({...s,nPulses:v}))} width={60}/>
                </CalcRow2>
                <CalcRow2 label="Spec"><CalcInp value={sho.spec||""} onChange={v=>setSho(s=>({...s,spec:v}))} width={150}/></CalcRow2>
                <CalcRow2 label="Std Setup Base ($)"><CalcInp value={sho.std} onChange={v=>setSho(s=>({...s,std:v}))}/></CalcRow2>
                <CalcRow2 label="Testing ($)"><CalcInp value={sho.testing} onChange={v=>setSho(s=>({...s,testing:v}))}/></CalcRow2>
                <CalcRow2 label="HFV Discount?">
                  <input type="checkbox" checked={sho.hfvDisc||false} onChange={e=>setSho(s=>({...s,hfvDisc:e.target.checked}))}/>
                  <span style={{fontSize:10,color:"#9aa5b1",marginLeft:4}}>25% off setup</span>
                </CalcRow2>
                <CalcRow2 label="PIA Multiplier"><CalcInp value={sho.pia} onChange={v=>setSho(s=>({...s,pia:v}))} width={50}/></CalcRow2>
                {hfvDiscount&&(
                  <div style={{fontSize:9,color:"#b45309",background:"#fffbeb",borderRadius:5,padding:"4px 8px",marginBottom:6}}>
                    HFV discount applied: ${baseSetup.toLocaleString()} × 75% = ${setupAmt.toLocaleString()}
                  </div>
                )}
                <CalcResult setupAmt={setupAmtPIA} testAmt={testAmt}/>
                <SpecSuggestion text={(()=>{
                  if(!sho.spec)return "";
                  const shape=sho.shape||"Half Sine";
                  if(shape==="Drop Shock") return "Drop Shock testing in accordance with "+sho.spec+".";
                  if(shape==="Bench Handling") return "Bench Handling Shock testing in accordance with "+sho.spec+".";
                  if((shape==="Half Sine"||shape==="Sawtooth")&&(sho.nPulses||sho.gLevel||sho.pDur)){
                    const pd=[
                      sho.nPulses?"Perform "+sho.nPulses:"",
                      sho.gLevel?sho.gLevel+"g":"",
                      sho.pDur?sho.pDur+"ms shock pulses":"",
                    ].filter(Boolean).join(", ");
                    return "Shock testing in accordance with "+sho.spec+". "+pd+".";
                  }
                  return "Shock testing in accordance with "+sho.spec+".";
                })()}/>
              </div>
            );
          })()}
          {tab==="ab"&&(
            <div>
              <SmartNote/>
              <CalcRow2 label="Spec"><CalcInp value={ab.spec||""} onChange={v=>setAb(s=>({...s,spec:v}))} width={150}/></CalcRow2>
              <CalcRow2 label="Std Setup Base ($)"><CalcInp value={ab.std} onChange={v=>setAb(s=>({...s,std:v}))}/></CalcRow2>
              <CalcRow2 label="Testing ($)"><CalcInp value={ab.testing} onChange={v=>setAb(s=>({...s,testing:v}))}/></CalcRow2>
              <CalcRow2 label="PIA Multiplier"><CalcInp value={ab.pia} onChange={v=>setAb(s=>({...s,pia:v}))} width={50}/></CalcRow2>
              <CalcResult setupAmt={Math.round(smartBase(ab.std)*sf(ab.pia,1))} testAmt={Math.round(sf(ab.testing)*sf(ab.pia,1))}/>
              <SpecSuggestion text={ab.spec?"Airborne Noise testing in accordance with "+ab.spec+".":""}/>
            </div>
          )}
          {tab==="sb"&&(
            <div>
              <SmartNote/>
              <CalcRow2 label="Spec"><CalcInp value={sb.spec||""} onChange={v=>setSb(s=>({...s,spec:v}))} width={150}/></CalcRow2>
              <CalcRow2 label="Std Setup Base ($)"><CalcInp value={sb.std} onChange={v=>setSb(s=>({...s,std:v}))}/></CalcRow2>
              <CalcRow2 label="Testing ($)"><CalcInp value={sb.testing} onChange={v=>setSb(s=>({...s,testing:v}))}/></CalcRow2>
              <CalcRow2 label="PIA Multiplier"><CalcInp value={sb.pia} onChange={v=>setSb(s=>({...s,pia:v}))} width={50}/></CalcRow2>
              <CalcResult setupAmt={Math.round(smartBase(sb.std)*sf(sb.pia,1))} testAmt={Math.round(sf(sb.testing)*sf(sb.pia,1))}/>
              <SpecSuggestion text={sb.spec?"Structureborne Noise testing in accordance with "+sb.spec+".":""}/>
            </div>
          )}
          {tab==="emi"&&(
            <div>
              {(ti?.dimL||ti?.dimW||ti?.wt||ti?.phase)&&(
                <div style={{fontSize:10,color:"#1a5276",background:"#eaf2ff",borderRadius:6,
                  padding:"5px 10px",marginBottom:8}}>
                  Dimensions, weight and power are pre-filled from the Test Item Description above.
                </div>
              )}
              <EmiForm s={emiCalc} set={setEmiCalc} ti={ti} setup={setup}/>
              <CalcResult setupAmt={suggSetup.cost} testAmt={emiTestCost}/>
              <div style={{marginTop:6,fontSize:10,color:"#6b7a8d"}}>Teardown: {money(emiTdCost)} &nbsp;·&nbsp; Total: {money(suggSetup.cost+emiTestCost+emiTdCost)}</div>
              <div style={{marginTop:10,display:"flex",gap:8,flexWrap:"wrap"}}>
                <button onClick={()=>copyToClipboard(EMI_NOTES)}
                  style={{fontSize:11,padding:"5px 12px",borderRadius:6,border:"1px solid #1a5276",background:"#eaf2ff",color:"#1a5276",cursor:"pointer",fontWeight:600}}>
                  Copy EMI Notes
                </button>
                {(emiCalc.revs||{})["Rev F"]&&onExportEmiF&&(
                  <button onClick={()=>onExportEmiF(emiCalc)}
                    style={{fontSize:11,padding:"5px 12px",borderRadius:6,border:"none",background:"#1a2332",color:"#fff",cursor:"pointer",fontWeight:600}}>
                    Export 461F Spec PDF
                  </button>
                )}
                {(emiCalc.revs||{})["Rev G"]&&onExportEmiG&&(
                  <button onClick={()=>onExportEmiG(emiCalc)}
                    style={{fontSize:11,padding:"5px 12px",borderRadius:6,border:"none",background:"#4a1942",color:"#fff",cursor:"pointer",fontWeight:600}}>
                    Export 461G Spec PDF
                  </button>
                )}
                {!(emiCalc.revs||{})["Rev F"]&&!(emiCalc.revs||{})["Rev G"]&&onExportEmiF&&(
                  <button onClick={()=>onExportEmiF(emiCalc)}
                    style={{fontSize:11,padding:"5px 12px",borderRadius:6,border:"none",background:"#1a2332",color:"#fff",cursor:"pointer",fontWeight:600}}>
                    Export Spec PDF
                  </button>
                )}
                {copyMsg&&<span style={{fontSize:11,color:"#166534",alignSelf:"center"}}>{copyMsg}</span>}
              </div>
            </div>
          )}

          {/* PQ Tab — full PqForm */}
          {tab==="pq"&&(
            <div>
              {(ti?.phase||ti?.amps)&&(
                <div style={{fontSize:10,color:"#1a5276",background:"#eaf2ff",borderRadius:6,
                  padding:"5px 10px",marginBottom:8}}>
                  Phase and amperage are pre-filled from the Test Item Description above.
                </div>
              )}
              <PqForm s={pqCalc} set={setPqCalc} ti={ti}/>
              <CalcResult setupAmt={pqSetupCost} testAmt={pqTestCost}/>
              <div style={{marginTop:6,fontSize:10,color:"#6b7a8d"}}>Teardown: {money(pqTdCost)} &nbsp;·&nbsp; Total: {money(pqSetupCost+pqTestCost+pqTdCost)}</div>
              <div style={{marginTop:8,display:"flex",gap:8,flexWrap:"wrap"}}>
                {pqCalc.rows&&Object.entries(pqCalc.rows).some(([k,v])=>v&&k.startsWith("B"))&&onExportPq300b&&(
                  <button onClick={()=>onExportPq300b(pqCalc)}
                    style={{fontSize:11,padding:"5px 12px",borderRadius:6,border:"none",background:"#154360",color:"#fff",cursor:"pointer",fontWeight:600}}>
                    Export PQ 300B Spec PDF
                  </button>
                )}
                {pqCalc.rows&&Object.entries(pqCalc.rows).some(([k,v])=>v&&!k.startsWith("B"))&&onExportPq300p1&&(
                  <button onClick={()=>onExportPq300p1(pqCalc)}
                    style={{fontSize:11,padding:"5px 12px",borderRadius:6,border:"none",background:"#1a3a4a",color:"#fff",cursor:"pointer",fontWeight:600}}>
                    Export PQ 300 Part 1 Spec PDF
                  </button>
                )}
              </div>
            </div>
          )}

          {/* DC Magnetics Tab */}
          {tab==="dcm"&&(
            <div>
              <CalcRow2 label="Spec"><input value={dcmCalc.spec} onChange={e=>setDcmCalc(s=>({...s,spec:e.target.value}))}
                style={{fontSize:11,padding:"3px 6px",borderRadius:5,border:"1px solid #d0d7de",width:200}}/></CalcRow2>
              <CalcRow2 label="Shift Rate ($)"><CalcInp value={dcmCalc.rate} onChange={v=>setDcmCalc(s=>({...s,rate:v}))}/></CalcRow2>
              <CalcRow2 label="Setup Shifts"><CalcInp value={dcmCalc.setupShifts} onChange={v=>setDcmCalc(s=>({...s,setupShifts:v}))}/></CalcRow2>
              <CalcRow2 label="Testing Shifts"><CalcInp value={dcmCalc.testShifts} onChange={v=>setDcmCalc(s=>({...s,testShifts:v}))}/></CalcRow2>
              <CalcRow2 label="PIA"><CalcInp value={String(dcmCalc.pia)} onChange={v=>setDcmCalc(s=>({...s,pia:parseFloat(v)||1}))} width={50}/></CalcRow2>
              <div style={{marginTop:10,padding:"10px 12px",background:"#1a2332",borderRadius:8}}>
                <div style={{fontSize:9,color:"rgba(255,255,255,0.5)",letterSpacing:1,marginBottom:2}}>SUGGESTED TOTAL</div>
                <div style={{fontSize:16,fontWeight:700,color:"#fff",fontFamily:"monospace"}}>{money(dcmTotal)}</div>
              </div>


            </div>
          )}

          <div style={{marginTop:10,fontSize:9,color:"#c0c8d0",fontStyle:"italic"}}>
            These are suggested prices only and do not affect the quote.
          </div>
        </div>
      )}
    </div>
  );
}


// ── Instrumentation Calculator ────────────────────────────────────────────────
function InstrumentationCalculator(){
  const [open, setOpen] = useState(false);
  const [inst, setInst] = useState({
    shock:false, shockCh:"1",
    cmShock:false, cmShockCh:"1",
    vib:false, vibCh:"1",
    cmVib:false, cmVibCh:"1",
    hsv:false,
  });

  const ITEMS=[
    {key:"shock",  chKey:"shockCh",  label:"Shock Instrumentation",        price:525},
    {key:"cmShock",chKey:"cmShockCh",label:"Contact Monitoring (Shock)",    price:350},
    {key:"vib",    chKey:"vibCh",    label:"Vib Additional Channels",       price:325},
    {key:"cmVib",  chKey:"cmVibCh",  label:"Contact Monitoring (Vibe)",     price:750},
  ];

  const total =
    ITEMS.reduce((a,i)=>a+(inst[i.key]?i.price*sf(inst[i.chKey],1):0),0)+
    (inst.hsv?1950:0);

  return(
    <div style={{marginTop:6,border:"1px solid #e0e4ea",borderRadius:10,overflow:"hidden",fontFamily:"Segoe UI,system-ui,sans-serif"}}>
      <div style={{background:"#f8f9fb",padding:"8px 14px",display:"flex",alignItems:"center",
        justifyContent:"space-between",cursor:"pointer",borderBottom:open?"1px solid #e0e4ea":"none"}}
        onClick={()=>setOpen(v=>!v)}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:13}}>🔌</span>
          <span style={{fontSize:12,fontWeight:700,color:"#1a2332",letterSpacing:.2}}>Instrumentation Calculator</span>
          <span style={{fontSize:10,color:"#9aa5b1"}}>— reference tool, does not affect quote</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          {total>0&&<span style={{fontSize:12,fontWeight:700,color:"#1a5276"}}>{money(total)}</span>}
          <span style={{fontSize:12,color:"#9aa5b1"}}>{open?"▲":"▼"}</span>
        </div>
      </div>

      {open&&(
        <div style={{padding:"12px 14px",background:"#fff"}}>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {ITEMS.map(item=>(
              <div key={item.key} style={{display:"flex",alignItems:"center",gap:8,
                padding:"6px 10px",borderRadius:7,
                background:inst[item.key]?"#eaf2ff":"#f8f9fb",
                border:"1px solid "+(inst[item.key]?"#1a5276":"#e8ecf0")}}>
                <input type="checkbox" checked={inst[item.key]}
                  onChange={e=>setInst(prev=>({...prev,[item.key]:e.target.checked}))}
                  style={{cursor:"pointer"}}/>
                <span style={{fontSize:11,color:"#1a2332",flex:1,fontWeight:inst[item.key]?600:400}}>
                  {item.label}
                </span>
                <span style={{fontSize:10,color:"#9aa5b1"}}>${item.price}/ch</span>
                {inst[item.key]&&(
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <span style={{fontSize:10,color:"#6b7a8d"}}>Channels:</span>
                    <input type="number" min="1" value={inst[item.chKey]}
                      onChange={e=>setInst(prev=>({...prev,[item.chKey]:e.target.value}))}
                      style={{width:45,fontSize:11,padding:"2px 4px",borderRadius:5,
                        border:"1px solid #1a5276",textAlign:"center"}}/>
                    <span style={{fontSize:11,fontWeight:600,color:"#1a5276",minWidth:55,textAlign:"right"}}>
                      {money(item.price*sf(inst[item.chKey],1))}
                    </span>
                  </div>
                )}
              </div>
            ))}

            {/* HSV */}
            <div style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",borderRadius:7,
              background:inst.hsv?"#eaf2ff":"#f8f9fb",
              border:"1px solid "+(inst.hsv?"#1a5276":"#e8ecf0")}}>
              <input type="checkbox" checked={inst.hsv}
                onChange={e=>setInst(prev=>({...prev,hsv:e.target.checked}))}
                style={{cursor:"pointer"}}/>
              <span style={{fontSize:11,color:"#1a2332",flex:1,fontWeight:inst.hsv?600:400}}>
                High Speed Video
              </span>
              <span style={{fontSize:10,color:"#9aa5b1"}}>flat rate</span>
              {inst.hsv&&<span style={{fontSize:11,fontWeight:600,color:"#1a5276",minWidth:55,textAlign:"right"}}>{money(1950)}</span>}
            </div>
          </div>

          {total>0&&(
            <div style={{marginTop:10,padding:"10px 12px",background:"#1a2332",borderRadius:8,
              display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:11,color:"rgba(255,255,255,0.6)",fontWeight:600}}>TOTAL INSTRUMENTATION</span>
              <span style={{fontSize:16,fontWeight:700,color:"#fff",fontFamily:"monospace"}}>{money(total)}</span>
            </div>
          )}

          <div style={{marginTop:8,fontSize:9,color:"#c0c8d0",fontStyle:"italic"}}>
            Suggested total only — does not affect the quote.
          </div>
        </div>
      )}
    </div>
  );
}

// ── V2 Product Picker ─────────────────────────────────────────────────────────
function ProductPicker({onAdd, onClose, setup, ti, vibs, hfvs, summary}){
  const [selected, setSelected] = useState({}); // {productKey: qty}
  const [thDur, setThDur] = useState("0 to 1 Day");


  // Smart pricing helpers
  const techRate = sf(setup?.techRate,175);
  const fabHours = sf(setup?.fabHours,4);
  const holes = sf(setup?.holes,0);
  const drillTap = setup?.drillTap||false;
  const drillCost = holes*0.5*techRate*(drillTap?1.5:1);
  const fabCost = fabHours*techRate;
  const smartSetup = Math.round(900 + drillCost + fabCost); // base 900 + fab + drill
  const hfvOn = hfvs?.some(s=>s.on)||false;
  const vibSetupAmt = Math.round(sf(vibs?.[0]?.stdSetup||900)+drillCost+fabCost);

  // T&H prices
  const TH_PRICES = {"0 to 1 Day":1000,"3 Days":1350,"5 Days":1875,"7 Days":2275,"10 Days":2950};

  // Weight-based shock testing
  const wt = sf(ti?.wt,0);
  const mwsTest = wt>0 ? (wt<=200?3975:wt<=500?4575:wt<=1000?5275:5975) : 4575;



  const PRODUCTS = [
    // Vibration
    {key:"vib_setup",cat:"Vibration",label:"Vibration – Setup",code:"94",price:smartSetup,smart:true},
    {key:"vib_test",cat:"Vibration",label:"Vibration – Testing",code:"94",price:3250},
    // Medium Weight Shock
    {key:"mws_setup",cat:"Medium Weight Shock",label:"Medium Weight Shock – Setup",code:"91",price:Math.round(1500+drillCost+fabCost),smart:true},
    {key:"mws_test",cat:"Medium Weight Shock",label:"Medium Weight Shock – Testing",code:"91",price:mwsTest,smart:wt>0},
    // Lightweight Shock
    {key:"lws_setup",cat:"Lightweight Shock",label:"Lightweight Shock – Setup",code:"92",price:Math.round(900+drillCost+fabCost),smart:true},
    {key:"lws_test",cat:"Lightweight Shock",label:"Lightweight Shock – Testing",code:"92",price:1450},
    // HF Vibration
    {key:"hfv_setup",cat:"HF Vibration",label:"HF Vibration – Setup",code:"52",price:Math.round(500+drillCost+fabCost),smart:true},
    {key:"hfv_test",cat:"HF Vibration",label:"HF Vibration – Testing",code:"52",price:1225},
    // Shock Other
    {key:"sho_setup",cat:"Shock (Other)",label:"Shock (Other) – Setup",code:"52",price:hfvOn?Math.round((500+drillCost+fabCost)*0.75):Math.round(500+drillCost+fabCost),smart:true},
    {key:"sho_test",cat:"Shock (Other)",label:"Shock (Other) – Testing",code:"52",price:1250},
    // Temp & Humidity
    {key:"th_setup",cat:"Temp & Humidity",label:"Temperature & Humidity – Setup",code:"53",price:500},
    {key:"th_test",cat:"Temp & Humidity",label:"Temperature & Humidity – Testing",code:"53",price:TH_PRICES[thDur]||1000,smart:true},
    {key:"to_setup",cat:"Temp & Humidity",label:"Temperature Only – Setup",code:"53",price:500},
    {key:"to_test",cat:"Temp & Humidity",label:"Temperature Only – Testing",code:"53",price:TH_PRICES[thDur]||1000,smart:true},
    {key:"hu_setup",cat:"Temp & Humidity",label:"Humidity Only – Setup",code:"53",price:500},
    {key:"hu_test",cat:"Temp & Humidity",label:"Humidity Only – Testing",code:"53",price:TH_PRICES[thDur]||1000,smart:true},
    // ESS
    {key:"ess_setup",cat:"ESS",label:"ESS – Setup",code:"54",price:500},
    {key:"ess_test",cat:"ESS",label:"ESS – Testing",code:"54",price:1000},
    // Salt Fog
    {key:"sf_setup",cat:"Salt Fog",label:"Salt Fog – Setup",code:"55",price:500},
    {key:"sf_test",cat:"Salt Fog",label:"Salt Fog – Testing",code:"55",price:1750},
    // Altitude
    {key:"alt_setup",cat:"Altitude",label:"Altitude – Setup",code:"56",price:500},
    {key:"alt_test",cat:"Altitude",label:"Altitude – Testing",code:"56",price:1000},
    // Rapid Decompression
    {key:"rd_setup",cat:"Rapid Decompression",label:"Rapid Decompression – Setup",code:"56",price:1000},
    {key:"rd_test",cat:"Rapid Decompression",label:"Rapid Decompression – Testing",code:"56",price:2275},
    // Explosive Decompression
    {key:"ed_setup",cat:"Explosive Decompression",label:"Explosive Decompression – Setup",code:"56",price:1250},
    {key:"ed_test",cat:"Explosive Decompression",label:"Explosive Decompression – Testing",code:"56",price:2450},
    // Acceleration
    {key:"acc_setup",cat:"Acceleration",label:"Acceleration – Setup",code:"57",price:2000},
    {key:"acc_test",cat:"Acceleration",label:"Acceleration – Testing",code:"57",price:1950},
    // Inclination
    {key:"incl_setup",cat:"Inclination",label:"Inclination – Setup",code:"93",price:1250},
    {key:"incl_test",cat:"Inclination",label:"Inclination – Testing",code:"93",price:1750},
    // Drip
    {key:"drip_setup",cat:"Drip Test",label:"Drip Test – Setup",code:"58",price:500},
    {key:"drip_test",cat:"Drip Test",label:"Drip Test – Testing",code:"58",price:750},
    // Submergence
    {key:"sub_setup",cat:"Submergence",label:"Submergence – Setup",code:"58",price:500},
    {key:"sub_test",cat:"Submergence",label:"Submergence – Testing",code:"58",price:750},
    // Spray
    {key:"spray_setup",cat:"Spray Test",label:"Spray Test – Setup",code:"58",price:1250},
    {key:"spray_test",cat:"Spray Test",label:"Spray Test – Testing",code:"58",price:1250},
    // Insulation Resistance
    {key:"insres",cat:"Insulation Resistance",label:"Insulation Resistance & Dielectric Strength",code:"59",price:500},
    // Noise
    {key:"noise_setup",cat:"Noise Susceptibility",label:"Noise Susceptibility – Setup",code:"11",price:1000},
    {key:"noise_test",cat:"Noise Susceptibility",label:"Noise Susceptibility – Testing",code:"11",price:3950},
    // Airborne
    {key:"ab_setup",cat:"Airborne Noise",label:"Airborne Noise – Setup",code:"12",price:Math.round(1000+drillCost+fabCost),smart:true},
    {key:"ab_test",cat:"Airborne Noise",label:"Airborne Noise – Testing",code:"12",price:2850},
    // Structureborne
    {key:"sb_setup",cat:"Structureborne Noise",label:"Structureborne Noise – Setup",code:"12",price:Math.round(850+drillCost+fabCost),smart:true},
    {key:"sb_test",cat:"Structureborne Noise",label:"Structureborne Noise – Testing",code:"12",price:2650},
    // Hydrostatic
    {key:"hydro_pre",cat:"Hydrostatic",label:"Pre-Test Hydrostatic",code:"95",price:500},
    {key:"hydro_post",cat:"Hydrostatic",label:"Post-Test Hydrostatic",code:"95",price:500},
    {key:"hydro_both",cat:"Hydrostatic",label:"Post & Pre-Test Hydrostatic",code:"95",price:1000},
    // Procedures & Reports
    {key:"proc",cat:"Procedures & Reports",label:"Test Procedure",code:"42",price:1750},
    {key:"rep",cat:"Procedures & Reports",label:"Test Report",code:"41",price:1050},
    {key:"coc",cat:"Procedures & Reports",label:"Certificate of Compliance",code:"41",price:250},
    {key:"modal_analysis",cat:"Procedures & Reports",label:"Modal Analysis",code:"67",price:6750},
    {key:"fixture_drawing",cat:"Procedures & Reports",label:"Test Fixture Drawings",code:"42",price:2950},
    // High Speed Video
    {key:"shock_inst",cat:"Instrumentation",label:"Shock Instrumentation",code:"33",price:525},
    {key:"cm_shock",cat:"Instrumentation",label:"Contact Monitoring (Shock)",code:"33",price:350},
    {key:"vib_ch",cat:"Instrumentation",label:"Vib Additional Channels",code:"33",price:325},
    {key:"cm_vib",cat:"Instrumentation",label:"Contact Monitoring (Vibe)",code:"33",price:750},
    {key:"hsv",cat:"Instrumentation",label:"High Speed Video",code:"32",price:1950},
    // Tear Down
    {key:"td",cat:"Other",label:"Tear Down",code:"96",price:750},
    // EMI
    {key:"emi_setup",cat:"EMI",label:"EMI – Setup",code:"51",price:0,custom:true},
    {key:"emi_test",cat:"EMI",label:"EMI – Testing",code:"51",price:0,custom:true},
    {key:"emi_td",cat:"EMI",label:"EMI – Teardown",code:"51",price:0,custom:true},
    {key:"emi_proc",cat:"EMI",label:"EMI Procedure",code:"44",price:3425},
    {key:"emi_rep",cat:"EMI",label:"EMI Report",code:"43",price:2850},
    // PQ
    {key:"pq_setup",cat:"Power Quality",label:"PQ – Setup",code:"51",price:0,custom:true},
    {key:"pq_test",cat:"Power Quality",label:"PQ – Testing",code:"51",price:0,custom:true},
    {key:"pq_td",cat:"Power Quality",label:"PQ – Teardown",code:"51",price:0,custom:true},
    {key:"pq_proc",cat:"Power Quality",label:"PQ Procedure",code:"44",price:2925},
    {key:"pq_rep",cat:"Power Quality",label:"PQ Report",code:"43",price:2450},
    // DC Magnetics
    {key:"dcm_setup",cat:"DC Magnetics",label:"DC Magnetics – Setup",code:"51",price:0,custom:true},
    {key:"dcm_test",cat:"DC Magnetics",label:"DC Magnetics – Testing",code:"51",price:0,custom:true},
    {key:"dcm_td",cat:"DC Magnetics",label:"DC Magnetics – Teardown",code:"51",price:0,custom:true},
    {key:"dcm_proc",cat:"DC Magnetics",label:"DC Mag Procedure",code:"44",price:1950},
    {key:"dcm_rep",cat:"DC Magnetics",label:"DC Mag Report",code:"43",price:1500},
    // Subcontracting
    {key:"sub_item",cat:"Other",label:"Subcontracting",code:"98",price:0,custom:true},
    // Custom
    {key:"custom_item",cat:"Other",label:"Custom Line Item",code:"94",price:0,custom:true},
  ];

  // Sort products by code number then label
  const sortedProducts = [...PRODUCTS].sort((a,b)=>{
    const codeA = parseInt(a.code)||0;
    const codeB = parseInt(b.code)||0;
    if(codeA!==codeB) return codeA-codeB;
    return a.label.localeCompare(b.label);
  });

  const toggle = (key) => {
    setSelected(prev => {
      if(prev[key]) { const n={...prev}; delete n[key]; return n; }
      return {...prev, [key]:1};
    });
  };

  const setQty = (key,val) => {
    const n = parseInt(val)||1;
    setSelected(prev=>({...prev,[key]:Math.max(1,n)}));
  };

  const handleAdd = () => {
    const lines = [];

    Object.entries(selected).forEach(([key,qty])=>{
      const prod = PRODUCTS.find(p=>p.key===key);
      if(!prod) return;
      for(let i=0;i<qty;i++){
        lines.push({label:prod.label,code:prod.code,price:prod.price,desc:""});
      }
    });
    if(lines.length>0) onAdd(lines);
    onClose();
  };

  const selCount = Object.keys(selected).length;

  return (
    <div style={{position:"fixed",inset:0,zIndex:2000,display:"flex",alignItems:"flex-start",justifyContent:"center",background:"rgba(0,0,0,0.4)",overflowY:"auto",padding:"20px 0"}}>
      <div style={{background:"#fff",borderRadius:12,width:"min(700px,96vw)",boxShadow:"0 8px 40px rgba(0,0,0,0.2)",fontFamily:"Segoe UI,system-ui,sans-serif"}}>
        {/* Header */}
        <div style={{padding:"16px 20px",borderBottom:"1px solid #e8ecf0",display:"flex",alignItems:"center",justifyContent:"space-between",background:"#1a2332",borderRadius:"12px 12px 0 0"}}>
          <div style={{color:"#fff",fontWeight:700,fontSize:15,letterSpacing:.3}}>+ Add Line Items</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"rgba(255,255,255,0.7)",fontSize:18,cursor:"pointer",padding:"0 4px"}}>✕</button>
        </div>

        {/* T&H duration selector — shown when T&H items selected */}
        {Object.keys(selected).some(k=>k.startsWith("th_")||k.startsWith("to_")||k.startsWith("hu_"))&&(
          <div style={{padding:"10px 20px",background:"#f8f9fb",borderBottom:"1px solid #e8ecf0",display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:11,color:"#6b7a8d",fontWeight:600}}>T&H Duration:</span>
            <select value={thDur} onChange={e=>setThDur(e.target.value)}
              style={{fontSize:11,padding:"4px 8px",borderRadius:6,border:"1px solid #d0d7de",background:"#fff"}}>
              {Object.entries(TH_PRICES).map(([k,v])=>(
                <option key={k} value={k}>{k} — ${v.toLocaleString()}</option>
              ))}
            </select>
          </div>
        )}

        {/* Products — flat list sorted by code */}
        <div style={{padding:"12px 20px",maxHeight:"55vh",overflowY:"auto"}}>
          <div style={{display:"flex",flexDirection:"column",gap:3}}>
            {sortedProducts.map(prod=>{
              const isSel = !!selected[prod.key];
              return(
                <div key={prod.key} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 8px",borderRadius:7,
                  background:isSel?"#eaf2ff":"#f8f9fb",border:"1px solid "+(isSel?"#1a5276":"#e8ecf0"),
                  cursor:"pointer",transition:"all 0.1s"}}
                  onClick={()=>toggle(prod.key)}>
                  <div style={{width:16,height:16,borderRadius:4,border:"2px solid "+(isSel?"#1a5276":"#d0d7de"),
                    background:isSel?"#1a5276":"#fff",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    {isSel&&<span style={{color:"#fff",fontSize:10,lineHeight:1}}>✓</span>}
                  </div>
                  <span style={{fontSize:10,color:"#9aa5b1",minWidth:22,fontFamily:"monospace"}}>{prod.code}</span>
                  <span style={{flex:1,fontSize:12,color:"#1a2332",fontWeight:isSel?600:400}}>{prod.label}</span>
                  {isSel&&(
                    <div style={{display:"flex",alignItems:"center",gap:4}} onClick={e=>e.stopPropagation()}>
                      <span style={{fontSize:10,color:"#6b7a8d"}}>qty:</span>
                      <input type="number" min="1" max="20" value={selected[prod.key]}
                        onChange={e=>setQty(prod.key,e.target.value)}
                        style={{width:40,fontSize:11,padding:"2px 4px",borderRadius:5,border:"1px solid #1a5276",textAlign:"center"}}/>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

        </div>

        {/* Footer */}
        <div style={{padding:"12px 20px",borderTop:"1px solid #e8ecf0",display:"flex",alignItems:"center",justifyContent:"space-between",background:"#f8f9fb",borderRadius:"0 0 12px 12px"}}>
          <span style={{fontSize:11,color:"#9aa5b1"}}>{selCount} item{selCount!==1?"s":""} selected</span>
          <div style={{display:"flex",gap:8}}>
            <button onClick={onClose} style={{background:"#fff",border:"1px solid #d0d7de",borderRadius:7,padding:"7px 16px",fontSize:12,cursor:"pointer",color:"#6b7a8d"}}>Cancel</button>
            <button onClick={handleAdd} disabled={selCount===0}
              style={{background:selCount===0?"#e8ecf0":"#1a2332",border:"none",borderRadius:7,padding:"7px 20px",
                fontSize:12,fontWeight:700,cursor:selCount===0?"default":"pointer",
                color:selCount===0?"#9aa5b1":"#fff",transition:"all 0.15s"}}>
              Add {selCount>0?selCount+" ":""}{selCount===1?"Item":"Items"} to Quote
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App({onLogout,currentUser}){
  const [qi,setQi]=useState({opp:"",account:"",billTo:"",billToCity:"",contact:"",email:"",prepby:"",rev:"",revDate:"",date:new Date().toLocaleDateString("en-US"),rfq:"",stage:"Proposal/Price Quote",type:"New Business",relatedOpps:""});
  const [ti,setTi]=useState({item:"",qty:"1",model:"",drawing:"",loads:null,dimL:"",dimW:"",dimH:"",wt:"",volt:"",pwrType:"AC",phase:"",hz:"",inrush:"",amps:"",mounting:"",pressureFlow:"",gsi:"Unknown",witness:"Unknown",docRestriction:"None",dpas:"",tiSpecs:"",tiNotes:""});

  // Multi-instance section state — arrays of instance objects
  const [vibs,setVibs]=useState([newVib()]);
  const [shocks,setShocks]=useState([newShock()]);
  const [noises,setNoises]=useState([newNoise()]);
  const [envs,setEnvs]=useState([newEnv()]);
  const [hfvs,setHfvs]=useState([newHfv()]);
  const [shos,setShos]=useState([newSho()]);
  const [dcms,setDcms]=useState([newDcm()]);
  const [pqs,setPqs]=useState([newPq()]);
  const [emis,setEmis]=useState([newEmi()]);

  // Single-instance sections
  const [inst,setInst]=useState({on:false,items:{}});
  const [ot,setOt]=useState({on:false,rows:[]});
  const [custom,setCustom]=useState({on:false,rows:[]});
  const [budget,setBudget]=useState({on:false,rows:[],markup:"25"});

  // ── Auto-add/update compressor budget rows when noise sections have a compressor ─
  useEffect(()=>{
    const COMP_COST_B={"<=140dB":0,"145dB":750,"150dB":1500,"155dB":1500,"160dB":1500,"165dB":2000,"170dB":3500};
    const noiseWithComp=noises.filter(s=>s.on&&((COMP_COST_B[s.level]||0)>0||sf(s.compBudget,0)>0));
    if(noiseWithComp.length===0)return;
    setBudget(prev=>{
      let rows=[...prev.rows];
      let changed=false;
      noiseWithComp.forEach((s,idx)=>{
        const pre=idx>0?" #"+(idx+1)+(s.identifier?" ("+s.identifier+")":""):"";
        const label="Noise"+pre+" – Testing";
        const desc="Compressor Rental"+(pre?", "+pre:"");
        const ac=COMP_COST_B[s.level]||0;
        const cost=String(sf(s.compBudget,0)>0?sf(s.compBudget,0):ac);
        if(sf(cost,0)<=0)return;
        const existIdx=rows.findIndex(r=>r.desc===desc);
        if(existIdx>=0){
          if(rows[existIdx].unitCost!==cost){
            rows=rows.map((r,i)=>i===existIdx?{...r,unitCost:cost}:r);
            changed=true;
          }
        } else {
          rows=[...rows,{desc,qty:"1",unitCost:cost,rollInto:label}];
          changed=true;
        }
      });
      return changed?{...prev,rows,on:true}:prev;
    });
  },[noises]); // eslint-disable-line react-hooks/exhaustive-deps
  const [coc,setCoc]=useState({on:false,price:"250"});
  const [sub,setSub]=useState({on:false,rows:[]});
  const [td,setTd]=useState("0");
  const [setup,setSetup]=useState({techRate:"175",fabHours:"4",holes:"0",cables:"0",drillTap:false});
  const [globalPR,setGlobalPR]=useState({procs:[],reps:[],coc:false,cocPrice:"250"});
  const [notes,setNotes]=useState("");
  const [lineOverrides,setLineOverrides]=useState({}); // {idx:{price,desc,deleted}}
  const [lineOrder,setLineOrder]=useState(null);
  const [unifiedOrder,setUnifiedOrder]=useState(null); // [{type:'auto'|'picker',idx}] // null=use default order; array of original indices when reordered
  const [dragIdx,setDragIdx]=useState(null);
  const dragFromRef=useRef(null);
  const dragToRef=useRef(null);
  const [abs,setAbs]=useState([newAb()]);
  const [sbs,setSbs]=useState([newSb()]);
  const [locked,setLocked]=useState(false);
  const [splitProcReport,setSplitProcReport]=useState(false);
  const [openQuotesPanel,setOpenQuotesPanel]=useState(false);
  const [openQuotesList,setOpenQuotesList]=useState([]);
  const [openQuotesLoading,setOpenQuotesLoading]=useState(false);
  const [dragOverId,setDragOverId]=useState(null);
  const dragRowId=useRef(null);
  const [modalAnalysis,setModalAnalysis]=useState({on:false,price:"6750"});
  const [fixtureDrawing,setFixtureDrawing]=useState({on:false,price:"2950"});
  const [inStockModal,setInStockModal]=useState({on:false,targetProc:""});
  // persist to saves
  const [savedQuotes,setSavedQuotes]=useState({});
  const [dashboardNeedsRefresh,setDashboardNeedsRefresh]=useState(false);

  // ── Approval system ────────────────────────────────────────────────────────
  const [approval,setApproval]=useState({status:"none",submittedBy:"",submittedAt:"",decidedBy:"",decidedAt:"",comments:"",history:[]});
  const [showApprovalHistory,setShowApprovalHistory]=useState(false);
  const [showFabGuide,setShowFabGuide]=useState(false);
  const [approvalComments,setApprovalComments]=useState("");

  const [showApprovalModal,setShowApprovalModal]=useState(false);
  const [showChatter,setShowChatter]=useState(false);
  const [quoteSentAt,setQuoteSentAt]=useState(null); // date string if this quote has been marked sent
  const [showFollowUpPopover,setShowFollowUpPopover]=useState(false);
  const [showProductPicker,setShowProductPicker]=useState(false);
  const [pickerDragIdx,setPickerDragIdx]=useState(null);
  const [advancedModeOpen,setAdvancedModeOpen]=useState(false);
  const [pickerLines,setPickerLines]=useState([]); // lines added via product picker
  const [quoteFlag,setQuoteFlag]=useState(null);
  const [showFlagPopover,setShowFlagPopover]=useState(false);
  const [flagNote,setFlagNote]=useState("");
  const [flagLoading,setFlagLoading]=useState(false);
  const [isDirty,setIsDirty]=useState(false); // true when test selections changed since last save
  const [snapshot,setSnapshot]=useState(null); // frozen prices/specs/notes from last save
  const [followUpDate,setFollowUpDate]=useState("");
  const [chatterEntries,setChatterEntries]=useState([]);
  const [chatterInput,setChatterInput]=useState("");
  const [chatterSaving,setChatterSaving]=useState(false);
  const [wonInfo,setWonInfo]=useState({wonDate:"",jobNum:"",poNum:""});
  const [wonLocked,setWonLocked]=useState(false);
  const [showWonModal,setShowWonModal]=useState(false);
  const [showCloneModal,setShowCloneModal]=useState(false);
  const [cloneOppInput,setCloneOppInput]=useState("");
  const [currentQuoteId,setCurrentQuoteId]=useState(null);
  const [wonApproval,setWonApproval]=useState({status:"none",submittedBy:"",submittedAt:"",decidedBy:"",decidedAt:"",comments:""});
  const [showCreateProjectAlert,setShowCreateProjectAlert]=useState(false);
  const [currentQuoteSource,setCurrentQuoteSource]=useState("vibrato");
  const [showDashboard,setShowDashboard]=useState(true);

  // ── Browser back/forward button support ──────────────────────────────────
  // Push a history entry whenever we switch between dashboard and quote form
  const navigateTo = (toDash) => {
    if(toDash){
      window.history.pushState({page:'dashboard'},'','#dashboard');
    } else {
      window.history.pushState({page:'quote'},'','#quote');
    }
    setShowDashboard(toDash);
  };
  useEffect(()=>{
    // Set initial history state
    window.history.replaceState({page:showDashboard?'dashboard':'quote'},'',
      showDashboard?'#dashboard':'#quote');
    const handlePop = (e) => {
      const page = e.state?.page;
      if(page==='dashboard') setShowDashboard(true);
      else if(page==='quote') setShowDashboard(false);
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  },[]);
  const recentSaveRef=useRef(0); // timestamp of last local save — suppresses self-triggered realtime toast
  const isLoadingRef=useRef(false); // true during handleLoad — suppresses isDirty during load
  const reloadOpenQuoteRef=useRef(null); // set after handleLoad is defined — used by realtime toast button
  const [toast,setToast]=useState(null); // {msg, type: 'success'|'error'|'info'}
  const toastTimer=useRef(null);
  const showToast=(msg,type="success",duration=3000)=>{
    clearTimeout(toastTimer.current);
    setToast({msg,type});
    toastTimer.current=setTimeout(()=>setToast(null),duration);
  };

  // EmailJS config — fill in after setting up emailjs.com
  const EMAILJS_SERVICE_ID  = "YOUR_SERVICE_ID";
  const EMAILJS_SUBMIT_TPL  = "YOUR_SUBMIT_TEMPLATE_ID";
  const EMAILJS_DECISION_TPL= "YOUR_DECISION_TEMPLATE_ID";
  const EMAILJS_PUBLIC_KEY  = "YOUR_PUBLIC_KEY";

  const APPROVERS=[
    {name:"Jordan McAdoo", email:"jordanmcadoo@nulabs.com"},
    {name:"Ragen McAdoo",  email:"ragenmcadoo@nulabs.com"},
    {name:"Russ McAdoo",   email:"russmcadoo@nulabs.com"},
    {name:"Russ McAdoo",   email:"rmcadoo@gmail.com"},
  ];
  const APPROVER_EMAILS=APPROVERS.map(a=>a.email);
  const isApprover=APPROVER_EMAILS.includes(currentUser);
  const isFollowUpUser=currentUser==="ccebello@nulabs.com"||isApprover;
  const isSalesforce=currentQuoteSource==="salesforce";

  // ── Browser tab title + history state for back button ─────────────────────
  useEffect(()=>{
    const opp=qi.opp||"";
    const label=showDashboard?"Home":opp?opp:"Vibrato";
    document.title=label;
    // Push a history state so the browser back button works within the app
    const state={showDashboard, quoteId:currentQuoteId};
    const currentState=window.history.state;
    // Only push if the view actually changed (avoid duplicate entries)
    if(!currentState||currentState.showDashboard!==showDashboard||currentState.quoteId!==currentQuoteId){
      window.history.pushState(state,"",window.location.pathname);
    }
    // Set favicon
    const existing=document.querySelector("link[rel='icon']");
    const link=existing||document.createElement("link");
    link.rel="icon";
    link.type="image/png";
    link.href="data:image/png;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCAJYAlgDASIAAhEBAxEB/8QAHQABAAEEAwEAAAAAAAAAAAAAAAgEBgcJAQIFA//EAFsQAAEDAwEEBQQMCgUKBAUFAAABAgMEBREGBxIhMQgTQVGBImFxkRQVGCMyQlJVgpOh0wkWYnJzkqKxwdE4lLK04RckMzU3Q1N1s9IlV5XwNFaDo6VjZ8Lj5P/EABwBAQACAwEBAQAAAAAAAAAAAAAFBgMEBwgCAf/EADcRAQABAwEFBAcIAwEBAQAAAAABAgMEEQUGEiExExRBUVJhcYGRocEHFiJTsdHh8BVC8TIjM//aAAwDAQACEQMRAD8AmWAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADjPDmM9p0e5rGK56oiNTKqvYRK6RG32tr6yo0toatfTUcLnR1Vyhfh8zkXCtici8GflJxd2YTniu3qbVOst/Zuzb+0LvZ2o9s+EM9652uaB0bO6lvV/gSsbzpKdqzTNXuc1md36WCwvdT7PfZHVrbtQ7mcdZ7Gjx6cdZn7CHLKeSZzpZXrly5VXcVcvefX2DF2Od9hF17Rq15Oi4u4dmaPxzMz7dPhCf+hdregdZTtpbLqCD2a7glJUNWCZy9zWvxvfRyX2vE1gSU80LmyxPVVauUVvBWr3kh+jxt9rbfXU+ltc1z6mjmc2OluUz8vhcq4RsrlXiz8peLe3KctmxnRXOlSB2zufdxKZuWJmYjwnr7p8UugdWOa9qOaqKi8UVDsSCkgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHM4wE5FHeK+ltlqqrjWythpqWF800i8msaiq5fUih+xE1TpDBXS/2kyac0/Ho+0Toy5XaJy1L2r5UNNyXHcr1y30I7zEQKGDfXrXpwTknee3tC1JWa41zctQ1SvRaydVijcueqiTgxng1ET05KJGo1iNamMJhCvZd+blbuG62xqcPGjijn1n1z/AAd+rf1PXY8je3c+fGTTXB0KKtgwvWNTgvNO4rThyI5FRyZRUwp9UzpLDkWYu0cMpZdD/aTJqPT8mj7tPv3K0xNWme5fKmpuSZ71YuG+hW+ckAprb2ealrND66tuoaVXqtHOiyxtXHWxLwezxaqp6cGxi0V9LdbVS3KhlSWmqoWzQvTk5rkRWr6lQn8O92lGk9YcL3q2X3LL46I0pq+U+P7q4AG4rAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA6qnavYYJ6ZmrVsezmPT1PLu1d8l6t2FwqQMw6T1ruN9DlM7r3KQR6WWp01FtfraeGVXUtojbQx8eCvbl0i4/Pcrfomrl3OC3PrT+7WF3rOp1jlTzn3dPmxhbo8Nc9U8yfxKs6ws3I0b3IdivVTrOrvmPb7O3FL6QR9bOyNud57kbw85W+3Fv6n2l9h1Xsje6vd3W/wCkzjOc/wDtCo0xTJJVuqHJ5MScPzl/9qe0lhgWuW/pE9Va5IHKjU3UerVVFVc5RytRezGEXjlDHFVOsxL4ypuRw8ExHPn/AHzWfPGsU741RcscrePmOh7Gp6bq6ttQ1PJlTj+cn/tDxz9pnWNW0pLjHwbIieZf4Exuhnq5b3s6k09Uyb1XY5erblcqsD8uj9S77fQ1CIM7OsjczvQyP0TtTpp3bBRU00u7S3aN1DJx4b7sOjXH57Ub9I38K7wXI+Cj75bOi/iVTEc4/FHtjr8k7wAT7ioAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA8bWl7g05pS6X2px1VDSyTuRV+FutVceK4TxNbc9VUXS8z3CsestRUTPnmevNz3KrlX1qTL6ZuoFtWyn2pjkVs13qmQ4TmsbPfH+HkoniQztzMI569vAiNo3OfD5OnbiYP4JvTH/qflH8qsA+tHCtRVRQp8dyIRLqi6bBT9RbY0VMOk8tfHl9mCk0dPebzqfUCWqmWroYLe+erakm6kUMDmqkqJ8ZyKq4TtRzkKu+1aW+yVNQ1d1WR7sf5y8GmcehHoyGHZ9ddSV1OyR97ldTx76ZzTx5aqehz1fn81DPgWO2qnVUd7Nrf4+1RNPWJifn/wBYOv8AT9fbZERMuj8tvhz+zJaSmUdY2R+ndTXKxTIuKOd0TFX40fNi+LFaYzrYlgqpIV+I5UNWImmqaZ8FpsXqMi1TdonlVETHsnm+JSwVNRbLxT3CjesdRTysnhenNr2qjkX1oVRSXJPJa5PQZrc6S1toWouWZifBsk0Ze4NR6Utd+psdTXUsdQ1EXlvNRceC5TwPZMG9DLUPtvspW0yucstoqnw4cuV6t/vjPDylTwM5ZLNar46IqedtoY3dsmu15TPw8Pk5ABkagAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAcPXDVUCGvTfv3s3aJbLGxyOjtlDvuRF5STOyqL9FjPWYTpWbkDE7VTK+J7W129rqfanqC7NkSWOevkZC7viYu4z9lqHlcuRXMqvjrmXe918Pu+HRTPhEfGec/NwevpeHfr3SqnCNn2rw/meQXPpeHct7pV5yPVfBOH8zSrnSlZ4edr+WWSCjtdOm9NVSphqc1xwan6yk/Nnun4tK6Is2nokZigo44XKxODno3y3eLt5fEhXsjs/wCNnSIsdC+PraW3SJUzIqcESFN/j9PcTxJ5p8HBO7Mt8NvicW36ze2zItRPKP8An7o29KWy+xNT2++MZhldAsUion+8jXgq+dWu/ZI76oh3Lg2VE4SM+1OH8iZ/SQtCXLZtUVTWb0tvmZUtxzRqLuv/AGXKvgRA1PDv29JU5xPT1Lw/kRmfb7PImfPmvW5Gb3nZVNE9aJmn6x8p0WwdKtm/A5O1Eyngdxz5mGOS2V0xVTNM+LMfQm1C23bSa2xSybsd2o13EzzliXfT9hZPUTP4ZNbezS9LpfaRY731iRspK+N0rl/4Su3X/sK42RMVHMRyLlFTgT2BXrb08nDd8cXss2LnpR845fpo7gA3lSAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAcIWztQvaac2e36+pI2OSjoZZIldy6zdVGJ4uVqFzGCumle/a7ZRHa45Fa+610cStT40bMyO8Mtb6zHdr4KJqbmzsfvGVbtecx8PH5IZULVdPleKoiqvpPQKS2t8lzl7VwVZWa55vROBb4LMesL2o2NpaCJr1RGxxorl9CZX+JaVuh6+ugixlHPTPo5qXBqyp9jaerHpwc9nVt9Llx+7JgqjimKWzduRbt1Vz4Rqy70FbK6quuqdZTxty5zKKB/bly9ZInq6olZ5jEfRI097Q7ELQ+SJY6i5ukuEqL2pIuGL9W1hlxS149HDbiHnPbGRORm3K5nx0+HJ5upbbHd7BX2yX4FVTvhd5t5qp/Egxc6WRIamjmarZWo6N6KnFHN4L9qE+FTPMh3tmtXtPtMvVO1F3JZ0qWcOyREev7SuTwIza9v8NNflyXf7OszS/dx58YiY93Kf1+TCQKm5Q9RXzxYwjXrj0c0KYi4dZedcG4qF7N5Mmw/YjfPxk2U6cu7pHSSy0LGTOdxVZY/e3qv0mqa97i3O6/uXBLroP332ds8uVjklc6S2V6uY1eTYpWo5MfTSQldnV6VaebmG/eJrZ7SP9avlP8AKQYAJhywAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAOFc1OaogHIOiPYvJyL2czuDQAAAAAAAAAAAAAAAAAAHVEwRC6dF7Wo1bYrAx6Kyjo31D0T5cr91M/Rj+0l6vA1+dJG8Le9tmopmqisgqEpGIi8kiajF/aRymnnV6W9PNaN0cftc/i9GJn3zy+qzKNu5A3zpk+pw1ERqInZwOSvzOsu7W6eGmKfJ6+l4t+4OkVOEbF4+deH8ztraKouEtqstIx0lTXVTWRsTm5yqjWp63FXpSLdpJZlTi9+PBE/xLg2S2z8Y+kZpqhVfebe9KuThnCxNWX7XbiDGo7S/EIreDJjGwLlfq/n6Jv6fttPZrFQWmlbu09FTR08SdzWNRqfYhX5CcsHPMtjztMzM6y64wvpI5dKy1uh1HabuiJuVFM+B35zHbyfY5fUSOUxR0nbWtZs+ZXsYjnUFUyRV7mOyx39pPUaWfb47FXq5rHunld22tZqnpM6fGNP1Q71RFuXBsiJwkYnHzpw/keQXJquLepIpccWPwvoVP8C2yu0TrS7/AC+VW3ep3+ZMmZuhJekodqFbaZHORlzt7kYiLwWSJyPT9lXmHlRFaqL28D2di15/Fzaxpu5ulWKOO4RxSu7o5F6t+fNhym5iV8NcT61W3pxe3w66fOmfjHOGxoHDV8lDksbgwAAAAAAAAAAAAAAAAAMogAHRXsTm5E7OKnZHNXkqKH7o5AAfgAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4PPvt2t1ktk9zutZDR0cDd6WaZ6NaxPSpS6y1LadJ6eqr7fKptNRUzN57lXi5exrU7XKvBE7SCW2balfdpd7c+d76W0QvX2Fb2O8lnPD3/ACpFTmvJOSefXyMimzHrTextiXtpXOXKiOs/SPWyxtR6UNXLNLb9AUjYImrj2xq48vd52RLwRPO7K/koYK1BrbWuo5Fku+pLvXIqqu46ockacc8GphqeCHkwUjGeU/Dnd3YhUpjuIS7l11zzl1zZu6+Li0RpTET59Z+L4Ulde6GXrqO4V9NJne34ah7XZ78ovMyLoTb7tE0tPDHU3R17oGKiPprh5blTzS/DRe7KqnmUsDtOs0TJW4e3x7UPijIqonWJbmXu/jZFE01UxPtj6+Cd2yDa3pnaPSrHQPfR3WJm/Pb51TrGpyVzVTg9ue1OXDKIZF4GsWjqq6y3GC4W6qmpamnekkM8Tla5jk5Kip2k4OjttZp9o1idS125Bf6FjfZcaYRJm8klYncq80+Kq45KhM4uX2v4aurlG8W7VWzpm7a50eMeMfvDLgAN1UwAAAAAAAAAAAABRXmthtlqq7jUOVIaaF80ip8lrVcv2Iaz6iqkuV6nr5lVZKmd871VcqquVXL9qk9OkpeVsmxbUdQyTclmp0pWd6rK5I1x9Fzl8CA9ubmRy9iJgito184h0jcLG147s+MxHw5/VXAHeJiySsjbzc5Gp4kO60u+yxdVbKdi9rd5fHiZI6EtsW57RNV6pc1rmU8DaWJy9iyPzw+jEnrMb3SVKO1VMyJwihdhPDCfwJEdCKxLbNkDrnJFuyXaulmR683RsxG3wy1/rNvZVHFdmpQ9/srssKLcf7f39NWeQAWJxl1+N6S3tolrW9aGvFtRqudPSvRiJ8pEy37UQuLCcDq9E3FTvQ+aqYqpmmfFksXarV2m5T1pmJj3IA3ePrrXPwwu5v8AinEs7syZR1rbfavVl3tbuLYKuViKqc27yqn2KhjCZixvdE7m1ytXwKhTE01TTPg9M492m9aouU9JjWPe6HnVCviq1fG5WvR281U7F5p9p6JRXFuHtf8A++Bntzzau0bfHa9jZJom7Mv+j7NemuaqV1FDULu8svYiqnrVT20TgYg6Il39tNiduhd/pLdPNSOXPPD99v7L2p4GX+0s9urioiXnXNs9hkV2/KZj5uQAfbWAAAAAAAAAAB1zwychTEvSJ2sU+zmxtpaDcnv9ex3sSLgqQt5LK9O5F5J8ZUxyRT5rriinilnxsa7k3abVqNZl6e1/a3prZxTIyvkdW3SVm/Bb4FTrHJyRzlXgxue1efHCKRT15t82iapnmjpro6yUD1VGU1v8hyJ55fhqvfhUTzIY3rKmvvVynuFyqpampnesk00rlc57l5qqr2n3iiZE3DE8e1SFv51dc6Ryh1vYm6FizRFd2Iqq85j9I+r5VdffK6Xrqyvr6mTO9vzVD3Oz35VeZ6un9ba103Jv2jUl3okyi7jalyxrxzxauWr4oUXFThUwacX6onVaK9i49dHDMax64jT4JB7LelDVxTRW/X9I2eFy49saSPD2+d8ScFTztwv5Kkn7HdLderZBdLTWQVlHO3eimhejmvT0oa1aila/yo8Nd3dil57GtqV92aXxHwPkqrRM9PZtA53kv5Zez5MiJyXkvJfNI42dPSvnChbe3OpiJuY0cNXl4T7PKfk2DjsPE0bqW06t09SX2yVTaijqWbzHIvFF7WuTsci8FTsPbJaJiY1hzOuiqiqaao0mHIAP1+AAAAAAAAAAAAAAAAAAAAADhccSmrqqnoaOasq5o4KeBjpJJHuw1jUTKqq9iIiZKlVIm9L/AGqvqauXZ7Yp8U8Sot2mYvw3c0hRe5OCu71wnYucV67FqnilIbM2fcz8iLNHvnyhjnpB7U6vaRqXq6N0kNhoXK2hp1XHWu5LM9PlKnJPipw5qucf0sCRJleL15r/AAPnRQInvrk4ry8xV8vSV29dm5VMy7xsfZdrDs000xpEdP39suAD2rNaOualRVoqRrxazkrvOvmME1RHVNPFBddfaKWogxDGyGRE8lzUwnoUteWN8Uro5Gq17VwqH5TVFQ+cjEkarHJlFPvo/UN00Zq2iv1qkVlTSSI5EzhsrF+Ex35Lkyi/4HyXiU9dF1keUTym8U9Bmt1zTKO2jh05NqYmNfrHk2OaE1LbdXaUoNQ2t+/TVkSPRFXymO5OY78pqoqL6D3e0h70LteratRz6Hr58UtzVZqLe5MnRPKb9Nqetid5MHPcWOxc7WiKnAdr7PnAyqrU9Osex2ABmRgAAAAAAAAAAI39Oi8dRpCw2RkmHVta+d7UXirYmY9W9InqIp25uId7vUzV02rv7N2n0dqavkW63Mzx+PI5zl+xGGGqVu7TsTzZIDOr4rku1blY3ZYdEz4xM/GeXyfQr7DH1t0hRUyjVV6+CFAe3pOPNRPN8lqNTxX/AAI+udIXiHfXs/U6ckYi4dLI1iedOa/uJzbG7I3Tuy7Tdn3VbJT2+LrUXn1jm77/ANpziENZQOv2udLadY1HezLhG16eZ0jWrnw3lNhLERrEROSJwJjZNGlE1OQfaDk8eTRajw/v1l9AAS7ngAAIodI6gWj2oVUyR7jKyCKZFxwVURWKv7CGCr9F1V1lREwjlR6eKEpuljbmo+x3ZqcVWWmf4ojm/ucRm1XGiVEE3ymq1fBf8Sr5dHBk1R5/Xm9Abp5Pedk2Z8o0+HJ4ZTXFuYs9ylSp0qW70D082T4pnSU3kU8VuqEkugfeUWDUun5HrlHw1kTeziisev7LCUiEE+iDeEte2qhp3vVsdyppqRe5V3esanrj+0nYhYcSrW1EeTg29NjstoVT6URP0+gADaV0AAAAAAAAACgeDrrUtt0jpSv1DdX7tNRRK9Uz5T3cmsb+U5VRE9Jrw1jqG6a01ZXX+7Sq6pq5FcqZy2JifBY38lqYRP8AEzX00Nf+2moqfRFBNmktipNW7vJ86p5LfoNX1vXuMD0UXVx7yp5S8V9BDZ1/WrhjpDqu5exIot9vcj8VXyjw+L6sYjWojUwiHYHaKN8srY42q57lwiEW6ZEREaQ6guugtFLTwYmjZNIqeU5yZT0IefeLP1LVqKRFWNOLmc1b508x8RciZ0fujxEPjUwJI3KcHJyX+B9gZInR8V0U108NS+uj5tTq9m+purrHSTWGucja6nRc9U7kkzE+Uic0+MnDmiYnfQVVPW0cNbSzMmp52NkikY7LXtVMo5F7UVFyazK6De98YnlJz85Irog7VZKWqj2eX2fep5VVbTM9fgO5rAq9y8Vb3LlO1MS2Dk/6VdHKt793pjXKtRzjr648/bHilmAgJZzUAAAAAAAAAAAAAAAAAAHAB4es9SWrSWnKy/3ioSGlpY95y9rl7GtTtcq8ETvU/JmIjWX7RRVXVFNMazKw+kdtMj2faOcyhlYt+uCLFQsXC9WnxpVTubnh3uVOzJBiJJaypfUVEj5XPcr5Hvdlz3KuVVVXmqrxVT3tpGr7rtA1nV365LuumduwQo7LaeFPgsT0JzXtVVXtPMiYkcaNbyQgczI7Srl0dp3V2DTh2da4/FPOfb5eyHYAqrZRvrapsTco1OL3dyGjM6LwrbBbUqJPZEzcwsXgi/HX+R6Gpb1FaKRFwj6mRF6qP+K+ZPtKuuqaW02100ibsUTcNanNy9iJ51Lc2daP1BtW12y10KpHve+VNQ5qrHSQovPH2I3tVfSqfti1N6rXwQ22NqUYNqeek/pHn+zvoq+T1b30tc9XPkcronqmEcvNzfT2oehqei340rI08pnCTHanYpKbWmwbTU2yiLTOmqOKku1u/wA5t9c9qdbJUoiZWV6JxR+ERexPJwnkohG2Bz6imcyrp3QTtV0NTTvTDopGqrXsVOxUVFQy5mNOPVFXhKN3X2/b2nRXb1/FT59ZjzWSD711O6lq5IHfFXgvenYp8DCtSmo6urs15prlQTLDVU0zJ4JE5se1covgqGxjZxqek1joq1aio8IytgR7mIuerkTg9n0XIqeBrouEe9DvJzbx8CSnQc1cq+2+ial68P8AP6RF7uDJW+vcdjzuJTZ93Srhnxcz342XFVrtqY508/dPX4SlOACZcqAAAAAAAAcBV4Kc9p5upLhHabBcLpKqdXSU0k7srhMMarv4CZftNM1TEQ1/bdbr7fbYtTVzHrIxa90DHL2tixGmPN5Bb6cOCFE2aWsuLqmd2/LK90sju9yqqqvrUrewrF+riq1eiNiWIsY0UR4REfCAufS8e5bnSKn+keq+CcP5lsF6WmNIrdTsXh5CKvjxX95q3J5JhcXR7tyXzpJ0Mjm70VopZKhcJwRzWbqftSp6ibmCKvQZtnsy+6x1RJxy+OkiX0uc932JGSqzwLNg0cFmIcA3qye8bRrny/79XIANtXQAAY06R9tWv2ZVc7WI59FNHUJ3oiOw79lykPtUxb1uR+OMciKvoXh/Inlre2tu+krra3IrvZNJJGiedWrj7cEGbpGstsnY5PK6tVx504/wK/tajhu01+br/wBneTx4d2x6NWvumP3hZgXjwUA0nQpVGz26u0/tAsd33kalHcIZHqvLdR6I7P0VU2UMVN1Mdxq9rW4nf+V/E2O7K7wl/wBnOn7xvKr6q3wvflcrvbiI79pFJvZ9esTDjm/ONwXKLntj9vqugAEkoIAAAAAAADqvcW7tH1NR6N0XdNR1mHMooFe1irjrJF4MZ9JyoniXHniRa6cerlT2o0TTPXj/AOIVaIvZxZE3177seZpiv3OzompI7Jwu+5dFnwnr7I6o01dVVXm81Nyr5XTVVTM+eeR3N73LlV8VUquwprfHuxby83cfAqcccFarq1l6DwLEWbUREdf7DguLTFFuRrWSJ5T+EeexO1TxKGndVVccDfjLxXuTtUum6VUVrtUlRupuwswxnevJqGCuZn8MeLbqqiimaqukPA1nfpaWeOgoJN2Zqo+V6Ii4Xmjf4qevp28x3Wnc17eqq4uE0S9i8sp5v3HvdFfZk7aBrSXUV8p1lsdsl35UkbltVUL5TY/O1PhO826nxjJ/SV2MupnzbRNDUrIqqmastzt8MfkztT4UrGp8bHFze1EynFOMj/j5qs6x1UKd7rdnaXZXJ/DPXyjy97AF/tyUz/ZMLcQvXiifEX+R5JeVDU0t2trZo03opW4c1ebV7UXzoWvcqN9FVOidlWrxY7vQj6JmOU9V+oriumK6ekqXmUU3W0lSyop5HxPY5HxvY7DmORcoqKnJUXiilah1kYkjFYvJTLTVpLBlY8X6NPFN3o4bTI9oWj2sr5WJfreiR1zEwnWJ8WVE7nY49zkXswZXNb2zjV112f6zpL9bVVzoXbs8Kuw2eFfhMX0pyXsVEXsNg2jNSWrVunKPUFnqEnpKqPeavxmL2tcnY5F4KnehYMS/2tOk9YcL3k2LOz8jioj8FXyny/Z7gANtWgAAAAAAAAAAAAAAC8gKK8XGitNtnuNyqY6akp2LJLLI7daxqc1VSDHSH2sVO0i/pSW500GnqJ6+xYXcFnfxTrnp3qi4anYnnVT1elbrbUt02h3XSUte5tmt00aQ0kSbrXqsbHbz8fDVFXhngnYnaYjpafcRHv4v7PMRGZl660R0dP3U3ZiIpybnOqY1jyiJ+rtSQdUzj8Jef8j7AEVM6un26Iopiml2a10j0YxFc5y4RE7VLvtVEyhpN1cb6+VI7z/yQoNOW/q2pWTN8pye9ovYneefry9JBAttp3++SJmZUX4KfJ9K/u9Jj0m5Vwwx5WRTjW5uVPNu01dqvUlLZrRFJUulmSCkhYnGWRy4z4/YniTw2FbN7fs20VFaotye5T4muNUif6WXHJPyG8m+K81UxV0NdlK2m3Lr6/0e5cK1mLZHI3DoYFTjLjsc/PDub+cSW44LHh48W6Ylw3eXbNebfm3TPKJ5+uf2g5EWeklpJtg10zUFFCrKC/IqzYTyWVrE4+jfjTe86xuXtJTcM5LO2w6X/G/QFwtcTGurWNSoolX4s8flM49meLV8zlMmXY7a1NPi0d3tpTs3Pt3tfw66T7J6/Dqg/qqmyyOranFPIf6Owt8vWpjbW0LmYVElZwRycWr2Z86KWW5qtcrXJhUXCoVeieWj0PFUVRxQ4ciORWryXmenss1M/Re0ez35XvZDSVSJU7vN0DvJkTHb5Kr6kPMXgpQ3KNWytk7HJhTZtVTTVrCL2ti05Fiaao5dJ9k8mzqGVk8LJY3o9j2o5qouUVF5KfZOBi3ow6qXVOyG1STS9ZV29FoKjjlcx4Rqr51YrF8VMpZ5lmoqiqmKo8XnnKx6se9Vaq60zMOQAfTAAAAAAOFMYdKK8JZ9id/ciqklXE2kjRFxlZXo1f2VcZQUjb067v1GlbBZGvwtXWvqHonNWxMx6syJ6jDfq4bdUpPY1jt861R69fhz+iKNublzndyFaU9vbiJXd6lQVqueb0Lh08NmHeCNZZ44k5vcjfWpd15mSltFXMn+7hdj1YQt6wR9ZdYeGUZl6+CfzK7X1R1OnXsTg6WRrETvRPKX9xi04q4h9ZVzsrFdflEpTdC2zLbNi1PWOi3H3StnqlVebkRUjavqj+0zcpa2yezJp/Znp2z4VHUtugY/Py9xFd+0ql09pbbdPDREPN2bd7bIrr85lyAD7awAAOr+LVTvQhJru3LatZ3m2u5RVsiN4fFVyuT7HITbReSkVOkhblotps9Qke6yup45kVO1yIrHf2UIra1GtqKvKV++zzK7PPrtT/tT84n9plH2eNYp5Il5scrfUp8yvv8AH1d1m4YR+Hp4p/MoCGidYdkUVxTDmu70Jr9De8JctjNPRuk3322snplRebUV3WNT1SIQtuDcxI7uUkf0D7vip1NYXr8JsNXH4bzH/vYSWz69K4hzvfnG48Wqr0Zifp9UrAATjkIAAAAAAAD4zyshgfLI9rGsarnKq4RETmprl2palfrTaPeL/vvfDVVKpTb3NIW+TGmOzyUT1qTN6T+qvxW2RXWSGTcrLiiUFNxwuZMo5U86MR6+CEEbczL3SdjUwhF7Ru6RFLom42z+Oqq/VHWdI9kc5VrURERE5JyOQctRXORrUyqrhEIZ117+labDJKtycV8hno7TzNbSVN0u1Fp+3ROnqJZGo2JicZJXrusann4/aXPC2OhtyI9UbHBHl6+hMqpcnQ/0o7Vu1is1ZXxI+ksyde1HcU9kSZSJPotRzvMqNMmHa7W7qrm8+0IwsKZ8/wC/OdEqtkWjaPQmgbbp2lRrnwRb1TIn+9ndxkf+tlE7kRE7C71RFTjxOxx6C0RERGkOB3K6rlc11TzlDjpCbPf8nOrfxmtEW7pe9TYniY1d2iqVyvDuY7iqd3FOxpYt0omV1JupjfTyo3ef+Sk69V2K2am09WWG80zaihrYljmjXtTsVF7FRcKi9iohB68WC6aE1ZV6Jve850GZLdUqmG1VOqruuTzpjinYqKnYQW0sThntaHWNyd4e2o7nfn8UdJ81jPa5j1Y9Fa5q4VF7FOpcWo7f1jVrIW+U1PfETtTvLdI+mrWHSHxq4OtblPhpy/kZG6PG1mq2cX9aS4umm09WvT2VC3isD+CdcxO9ETDk7U86IWB6CmqqbfXrGfD7fOZ7N2bdWsIXa+yredZqoqjWJ6/vHrhsutFyobtbae426pjqqSpYj4po3bzXtXkqKVfZkhD0U9b6lte0K1aRiuDnWW4yvSaklTeaxUje7eZn4CqqcccF7U7SbzeRYbF6L1Orhe19l17NyOyqnWJ5x7PX63YAGZFgAAAAAAAAAABeQC8gIHdI5rf8tupXI1EVZ48rj/8ARjMemSOkvG2HbfqJrVVd58Llz3rBGpjcq9//APWr2z+r0dsTSdnWJj0Y/SA9aw232TIk87feGrwRfjr/ACO1psz53JNVIrIuaN5K7+SHrXe5UlooutmwmExFE3gr17k83n7DWqqmZ4aeqRrrpt0zVVOkQ+OpbxHaKHfTDqiTKQs8/evmQ9TozbL6jaRrRbteIXP0/bpUkrXv5VMvNsKd+ebu5vDhvIWdoHS2oNqevILRQIu/Ku/UTbuY6WBF4vXzJnCJ2qqJ2mwbQelbRovS9Dp2zU/VUtIzd3l+FI5eLnuXtc5cqv8AJEJfAxNOcuW727wzP/ytzznp6o8/bL342NjY1jGo1rUwiImERDuATTmQcOTgpyAIe7atOLpvaLcoI2K2lrXezqfuRJFVXtT0SI/wVDEGooFguT3ImGypvp/H7SXXSlsHs3TVFqCGPMtum6uVyJx6mXCL4I9GL6yLOqYOsomTonGJ3H0L/jgq+Za7G/MeE83fN0dod92XRMz+Kn8M+7p8tFsnyrWb8C96cUPqFMcTpKxV0xXTNM+LOPQf1O6i1fdNKzyokFxp/ZEDVX/fRc0RO9WOVV/MQmAiIi8DW3s71BLo/aDZ9QRq5Eoaxr5EReLolXde3xYrkNkEEjJYWSxua5r0RzVauUVF5KT2Dd4qOHycN3wwuwzYuaf+o+ccp+j7AA3lTAAAAAHCcyFnTZu/s3alR2trsst1uYjkz8eRznr+zuE0lxhVNdm3C7pftsGpa9kiyMdXvhY5V5tjxGmPNhhpZ9WlvTzWvc7H7TO4/Rj5zy/db1K3dganmydwnBMAgJd0op4aYjye3pOPM883yWo1PFf8Ctkt7r/tA0np1rUclXcI0e1eW6sjUXPm3UcNLx7ltV6p/pHqvgnD+ZeHR2trb50lKOVzFkitFHJUL3I5GbiL+tL60PrEo48iIQe82T3fZtyf75psxoiMRE5Y4HYAtTz4AAAAAOETBgTpY2/hY7qiLlHSUz+7Coj0/suM954mNekdbVrtmVXO1qK6jljnTvwjsO+xympm0cdiqE7uxkzjbVs1+c6fHl9UMtWR4ngm+U1Wr4L/AIniF0aoi37cj0TjHIir6F4fyLXK1bn8L0LLpVN3qd7fNkyT0Q7ulr2126Fz1ZHcaaejd3Kqt6xqeuNPWY5XimD7aAuq6f17YrvvI1KO4QyvVfko9N79nJuY1fDXEq3vJjdvi10+dMx+zZaDrGqKxFTlg7FkcBAAAAAAA+U8rIoXyve1jWIrnOcuERE5qCOaIfTf1O6t1ha9KwSosFup/ZE7UX/fS8kVO9GNRU/PUwRRs3Kduea8VPS2h6gl1ftAu+oJFcqV1W58aKvFsSLusb4MRqFEhXMq5x1zLvW7GB3XEopmOcR855yHpadg6+4scqZbEm+v8PtPNLm0tB1dE+dU4yu4ehP8cmnXOkLRCm19W+xrIsLXYfUv3Popxd/D1kvOiro9dI7ILck8asrbp/4hUoq8UWRE3G+EaM4d+SJVhsb9dbZLJpdjN+nWdjajiqokbffJl4fkoqenBsKijZFE2NjUa1qIjURMIiJyQmdl2eGjilx/fvaPa34sUzyj6fzq+oAJZz1wYr6RWzVNoWkUfbkbFqG2Ks9tmyjVV3xo1XudhPQ5GryyZUwD5rpiuOGWXHv149ym7bnSYa+rLXvrGTQVcLqavpXrDV0727rmPRcLlF5cUVMdi5Q8i+232NIs8LfeHLxRPiL/ACJCdKrZVVsnl2m6Qp1Wshbm7UkbcpPEicZkROaoiIjk7UTe5oucJWi40l3oethwuUxLE7irFXsXzeftKxlY1WPXy6O87ubet7Ux41n8cdYWkD2LvZ3wKs1Kivi5q3mrf5oeOYomJ6LI+kF0uFkqGXi01UlHX0i78M8a4exeXDwVUx3KpsjtMrprZSyyLl74WOcveqtRVNZ13XFum9H8TZfZP9T0f6CP+yhM7LnlU5L9olFMX7UxHPSf1VwAJVzcAAAAAAAAAAALyAAhh0irNHU7Zb7UOne3eWDLUan/AAWJz8Cy6K10dKqOZHvvT47+Kp/Iyb00IPxW1Dar3QK59Re+u9kJLhzWdS2JrdxExjKOXOckbK+93a4r1UtTK5HLhImeSi57MJzKzkY1yb1Ws8tXcti7cx6dmWYiJmYpiPLnEaT84XtfNT0Nua6OFzamp7GsXLWr+Uv8ELd0xYdTbRtWRWm0Uz62tn4qvwY4I05ucvJjE/wTKqXzsq6P2t9avhrK2ldYbM9Ef7Lq24kkbn/dxfCXhxRVwnnJmbMdn2m9nlgbaNP0m4jlR1RUSLvTVD8fCe79yJhE7EN7FwNOcq1t7eyJiaKJiZ8o6R7fN52xXZpZ9melmWyhRs9fPh9fWOZh88mPWjE47rezj2qqmQO0Dhgl6aYpjSHNbt2u7XNdc6zLkAH6+AAAePq60R37TNxs0rtxlZTvhV2M7quaqIvguF8CEV1oZon1VtrGbk8bnwytX4r2qqL9qE8+zgRM6QVmW0bTK2VkTY4Lg1lVHu9qqm6/x3mqviQ+1rWtFNyPB0X7O8/s8qvFqnlVGse2P3j9GAnIrXK1yYVFwpwV9/g6i5yYTDZPLTx5/aUBExOsOuqG4s98a7scmFJ79GrUf4ybHbJUSSI+ppIvYU/Dk6LyUz51Zur4kD65m9Aq9reJIzoMakbHW37Sc8i+/NZXUzVdwy3yJMJ34WNfAk9n3NK9PNzrfnB7TGm5Ec6Zifd0n90rgATbkQAAAAA8zVFyjs2m7ldpVakdHSyzuVeWGMV38DWjHLNV3B9TO5XyyPdJI5e1y8VX1qTv6U13badiV+XeVJKxkdHGnesj0Rf2d4gjbW++vd3Jgido184h0vcLG1iu55zEfCNfqrQD6U8fWzxxJ8dyN9akQ6uvC1RJDbqeNUxhiKvjxX95lToMW1au96w1Q/k98dLEuOeXOkd9m4YovU6UlnrJk+JC7d9OMJ+8kr0MLMtr2KUtZIzdfc6yeqXhxVEVI2r6o/tNzZVHFcmpQPtAyeDEptR4z/f0lm0AFhccAAAAAHVTx9Z21LvpO52xzd72RSyRonnVq4+3B7PM4dhUVO9D8qiKo0l92rk264rp6xOvwQCukSy22eNzV3urVcedOP70LM7EMsa/ty2rW17ty8oq2VG8MeS52837HIYqqI+pnkiX4jlb6lKjETTVNM+D0zjXab1mi7T0qiJ+PN8+w82ubidyfK/ih6RRXJuFavemDLbnm19oW+K1r5Ni+yi7pf8AZtp675VXVNvhc/PPfRqI79pFLp7TCPQ1vK3HY9DROk3n2ysmplReaNVUkb4Yk+wza0s1qrioiXnbPs9hlXLflM/q5ABkagAAOvMxv0lNRfi1sdvlRHIjKmri9hQcOKul8lcedGb6+BklUIpdOjUjZK6w6UglX3pr66pajuGXeRHlO/CSL4mDJr4LcylNh4nes63RPTXWfZHP+EbLe3y3O7GphCuPhRM3YUXtdxPuVuudZehMO3wWoh2aiuVGtTKquELzZ1dBb/LVEjp4suX0JlS2rBB19yjymWx+Wvhy+0rtd1fsawujRVR070Zw+Tzd+77TDMcVUUsmRdizaquT4Qy50FtOS12odQa4q2qrY2+wYHKnB0j1SSRfSiIxPpkuO3BjLoy6a/FjYxYaWSJsdVVwrXVGOaumXfTPnRisb4GTS2WKOC3EPOm1smcnLrr18dPg5AQGVHAAA6OajmK1yIqKmFRSH3SM2L1+kbpPrrQlM5bU5Vlr6GFv/wAKqrxc1qc4l7Wp8Dj2cphdgcjXJhUyhiu2abtPDU3tnbRvYF6Ltqf5a7rHqehuDWxzPbTVHa17vJd+a7+CnoVtro6pVc+Pcevx2cFX+Zm7bh0aKG+1FRf9CPgttwkVZJrfJ5NPM7iqqxf925V7Pg/mkZL7Qa40HcFtl8oa62ytxhlSzejcnYrXcWqnDm1ewgb+z6rc60uv7I3vsZVERX1+fw8fbCv1JZYqe0TTtne5EcxN1Wpxy5E5+Jsaoo2xUsUbEw1rGtRO5EQ1lVup6+4Ua0c8cG5I5uXNYqLwci9+Ow2bwf6GP81P3G9syiqmmqKlS39yqMm7aqt9NJ+j6gAlXPwAAAAAAAAAAAABaO0DZ3o/XjqJ2q7Qlx9gq/2PmeSPc393e+A5M53W8+450ls50LpWRs1g0ta6KdvwZ2wI6VP/AKjsu+0uxQh88FOuunNl7xd4Oz4p4fLXl8HKIAD6YgAAAAAAAHCmGOlRZFqtM0F8jaquoJ+rkwnxJMJlV7kc1vrMzLwPC17Z23/R12tDm5WopnsZ5n4y1fByIYMi12lqqjzSexc2cLPtX/CJjX2Tyn5IG6qg3oIqhE4sdur6F5Ful63SndPQzwParZN1fJVOKOTs9aFlFVtzy0ejtYmNRyI5qtXkvAuTYLf10ttcsFxkerIHVSUtQvZuS+9rnzIrkXwLbQoa3ejqN5iq1y4c1UXkvebVmqaa9YRG2canIx5pq6TEx8Wz9Mc+855lrbKtQN1Ts7sd+R28+ro2OlXOffETden6yOLoTn6CzRMTGsPPF23VbrmirrE6fB2AB+vgAAEaOnZd+p07p6xMemaqqkqpGpzxEzdbnzZkX1EW6BvvGflKZf6aF5W47XEtzV8i10MUKpn478yKvqc1PAxLTt3IWN7kIDOr4rku2bl4nZYVEz4xr8Z5fJ3PR0/F1l1iXGUZl6+CfzPOPc0lFmSeZU5IjU8eP8CPrnSF2g2gVCw2BYm855Gt8E8pf3ITv2V2ZNPbOdPWXdVrqS3wxvzz39xFd+0qkIKS3N1FtT0hpx3lRVFfEszcZ8hXpvfstcbBI/gp5iZ2VRpbmpx37QMrjyqbUeH9/d3ABLOfgAAAAAAAIr9Ja2pQ7SHVbURG19KyVcfKbli/Y1pgXUMXV3SVcYR+Hp4p/Mld0sLcr7dZbsyNPeppKeR3bh7d5v2s+0i5qyL32nlROaK1fDj/ABKvmUdnk1et33dHK7zsi1M9Yjh+E6R8tHhoU9wbmHPcpUHWdN6Jyd6GOJ0lP3qeO3NKQ/QPvDWV2prC9eL44KuP6KuY/wDtMJWkD+iXePanbda4nyKyK4xTUb+5Vczfan6zGk8E5qWHCq1taeTg+9VjstoVVelET9Po5ABtq2AADq7hxNeW3nUC6p2vX64Mer4G1S00C9nVxe9pjzKrVXxJzbVtQN0ts8vl+3t19JRvdEuce+Km6xP1laa5qJHSVO89VcqZc5VXmveRu0LmkRT7193Hwu0vV3p9UR+s/RXIm6iInJOByAQjskclxaVg3YJahU4vdup6E5nNJZnaz2r6e0mxHLHNURsn3UyrWKu9Ivgxqno22FKa3wxuw3dZly/apfHQqsq3zanfdXTRZit9OscLlTgkkzsJj0Rtcn0jJhW+0vK1vbnd02fVp1n+/romHExscTWNajWtTDURMIidiH0ALS4GAAAAAAAA4Qo7rbbfdaN9HcqGmrKWT4cNRE2RjvS1yKilbyOMgiZidYYxuWwjZLX1HXzaMo4pFdvYp5ZYG5/NY5E+wyYxqMajWpwTgh2T0g+Yppp6QyXL1y7ERXVM6ec6uQAfTGAAAAAAAAAAAAAAAAAAAAAAAAAAAcOTLVTvOQBDXa9ZUsO0S70bWIyJ83siJEXhuSeV+9XJ4GILpB7Hr5ouxHZT0LxQlP0rrOjKuzX6Nv8ApEfSyrjtTy2f/wAyNOqod2eKoROD27q+lP8ABSq5NvssiqHoXdrN77su1cnrppPtjlPx01eIhTXBiujR3yVx6ypOkzN6Nyd6HzTOkpe/Rx25pSt6D+ofZuh7np2WRqy2yr62NuePVTJnl5ntf6yRHeQX6Imolsm1+moZHq2C7U8lI5Ozf+Gz7Wqn0idHDipYsOvitR6nAt5sXu+0KtOlXP8Af5uQAbSAcKcOVERV8w5ltbUb2mnNnt+vXWdW6loZXxu/L3VRn7SofkzpGsvq1RNyuKKeszogJtRu/wCMe03UF3aqujqrlKsSqvHq0dus/Zah5x59A1XVCZ4q1FVfSeivBSsXquKvV6K2RYizjxTHSNI+EOC6dMx7lrR//Eerv4fwLWL2pGpS0EbXYRIo0V3gmVNa5PLRK9F0dGG3OvXSOfXcHRWailkRV71akSeOZHL4E1CL/QPtKy0mqtUzQ+VVVcdLFIvc1Fe9E8Xs9RJ8s+FRwWYh593nye8bRuVeX/fq7AA2kAAAAAAAAAx70gbalx2XXRUarpKRGVLcdiscir+yriHGpot+2K7/AIb0d/D+JPm/UcdxtFZQS/AqYHxO4djmqn8SC10pXtiqqJ6e+MR8Ts/KblP3oQO1qOGumvz+n/XW/s5yuLHvY8/6zE/GP4WKADQdGc6Suj9Paxtd4YuFoK6Ko49qMeir9mTZZA9ksLJGORzXNRWqi5RUXkprCr24qF7nJ/gbCthN6W/7INM3J2Fe6hZDIuc5fF725fWxVJrZ1esTDkG/WLw1UXY8JmPrH1XyACTc9AABHbpwag9g6JtmnopGpLc6vrZG549VCmeXne5nqImW9mIld8pceoyp0vdRe3W2CpoYpFfT2inZSNROW/8ADk+1yJ9ExjAzcia3uQgM25xXJdr3Mweww6ZnrMa/Hp8ncqrXB7Ir4YuxXZX0JxUpT29Kw708tQqcGN3U9K/4IaFU6Qu6t1XVrR2GqkauHvb1bMd7uH7sknuhpptLJsdp7hJGjai8zvrHL27nwI0/Vbn6RE/WEVRdbraNPUab1RW1DWNb3ue5GM4elVNhmnLXTWSw0FopGo2noqaOnjREx5LGo1P3Ersm1pE1OU/aBna102I/un/fk9EAEy5mAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALE252Zb1s0ukTGK+amYlVEnnjXeX7MoQz1BCk1rkcnFY8PT0dv2GwGojZNA+KREc17Va5F7UXgpB/VVpdaNQXOzSp/8NPJDzzlqL5K/qqikHta3pNNyPY6t9nWbxW7uJM9JiqPfyn6fFjIHeeNYZnxO5scrV8DoRzpj5Wi41Fh1JRXek4T0VVHUxYXHFrkcn7sGymyXCC62ijudK7egqoGTRr3tc1HJ9ims+4sw5kiehSbvRH1H7e7H6GlkfvVFpkfQvy7K7rfKjXHYm45E+iS+zrnOafNyffvB0im9EdJ0908/77WYgASzmrqvDiYR6Zl7W17IX21jk6y7VkVPjPHcaqyuVP1ETxM3LjBEHpzX32VrGyaeYqK2gpH1L8L8eV2ERfQ2NF+kYMqrhtSmd3sbvG0LceEc/hz/AF0YBtqcHO7+BVnyo27sCd68T6lbqnWXoHGo4LVMKi3xdfW08WMo56Z9HaXFqqf2Np+skReLmdW30uXH8Ty9Lxb9xWRU4RsVfFeH8ztrxJamO32qnRVlrKhGtTvXKNT7XIY6Y4rkQ+M+72ONXX6v4TB6JllSy7DLIqsc2Wv6yukynPrHru/sIwyyedpu2xWbT1utEK+9UVLFTsXGMoxiNT9x6PaW23Tw0xDzdk3e2vVXPOZlyAD6YQAAAAAAAHVcKip3kOdsNsW07S73TbrUY+f2QxE5br0R/wC9VJjIuSOHSptLafUtrvLERErKd0MmO10bsovqf9hGbVo4rGvlK7bhZfY7T7Of96Zj3xz+koy3GLqK6eLGEa9cejsKc9bVEW5cUkROEjEXxTh/I8khKZ1h2xSXFuGsf4KS86EF6bW7OrlZnKqy224K5E7Ejlajkx9JryJNY3ep3J2pxM19CG+rQ7RLjY5JEbFc6Hfa1fjSwuymPoOk9RIYFelyFE32xO1xK5jw0n4cp+SZoAJ5xhwpRXqvgtVnrblVO3YKWB80i9zWNVy/YhWmHulvqP2i2PVtNFJu1F2kZQx4dhd13lSL503Gqn0j4uV8NM1eTZw8eci/Raj/AGmIQputwnvupK671WXTVtTJUSZXPFzlcv78H1KO3JlXP8EKwrNydZeiNmWYtWYiHPIuzT0HU2yNceVKqvXx5fYWrDGs0zIm83uRqeJeNwnbQWyedODYIlVvpRMJ9uDXuc9Ihv1VRTTNU9Ie30brP+NXSIgrHMWSkssb6pV7MsTcj/bdnwJx9pGnoI6eWm0pfNVVDPfbjVpTROXmscSZcvi96/qkluBZ8O3wWoh593lzJys+ury5OQAbSBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHUjB0mrI6366iujWIkNyp0VVRMZkj8l3juqxST/bkxV0m7L7YaBS5sYiyWydsqrnHvbvIf+9F8DSz7XaWKvVzWXdHO7ntW3Mzyq/DPv6fPRDfUsPVXFZEThK1HePJTyy59UQdZQtmROMTuPoXh/ItgrlE6w77L5VjN+nVO1OKGc+hDqT2Dre6aZnkRIrpSpNCipzlhXOE9LHOX6JhHswVmzzUEmkNf2fUEaua2hrGPlRvN0SriRvixXIbuJc4K4lWN58HvWJXTHWY+cc4bJwfKnkjmhZLG9Hse1HNVFyiovFFPqWNwSeTqqoiGvHbzfE1Lti1HXxqvV+zFpo/O2JEiRU8y7qr4k7NpF+TTOhL3flRFdQ0Uk0aKuN56N8lPFyohrhpd+Sr6yRyudlXOVVyqr3+sjdoV6RFPvX3cfD471d6fVHx5z9Fc1MIiJyTgcgEI7JC5dLQ7lFJMqcZH4RfMn+OT29lNqbqfpF6ctz2udT0EiVUvDKJ1TVlTPmVyMQo7ZElPb4Y3eTusRXePFTI3QctbrlrfVerZUVEihZSx55Ksr1euPQ2NvrM2BR2l/VVd8cvu+zqojrP/P1lLhvJDkAs7hAAAAAAAAAAAOFTJirpNWr2bs99nMaivt9SyVeHHcdljv7SL4GVTxtZ2pl80vcrRJjFVTPjRV44VWrhfBcKYb9HaWqqfOEhsnK7nm2r3o1RM+zx+SBeqod6jjmROMb8L6F/xwW0XrdYHS0NRA9uJEauWr2OT/FCyiqW55aPSMTrGrhyJxReS8D2djd8XTG1bT13c9sccNeyOZzuSRSe9vX9VyqeOnFTzq1qsqFxw3uKGzZq4atYRG2MeL+PNNXSdY+MNoTVRURfMcoWzsvvyan2f2K+5RX1dFHJJhc4k3cPTwcioXLyLPE6xrDzvcom3XNFXWJ0FRM5Uh303tSeztb2zTMMiLFa6ZZpUROUsy5wvoY1q/SJf1EkcMMksj0YxjVc5VXCIicVU1v7RNQSaw2gXjUEjnObXVj3xI7m2JFxG3wYjUNLOucNHD5rXudhzezZuaf+Y+c8o+rzqJm5Aidq8VPqAQMzq7lbpiimKY8Hqaah624pIqcImq7x5Id9oVUsVqipGcX1D8qnarW8f34K/S8HV0LplTjK7h6E4fzKzQNlTWm3rT9ie3rKWnnbLO1V4KyJOtenjhG+Ix6O0vRCK25lRi4Vdc/3z+SZ+xfTS6R2YWCwvjRk9NSMWoTGPfn+XJ+05S8ThFwmPMclriNI0h54uXJuVzXPWebkAH6+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABweZqW2RXiw11rn4Mqqd8LlxnG81Uz4ZyemvnB+TGsaS/aKpoqiqmecIFXOjljWqt9SxWSxufBK1yYVr2qrV+1CxHNVr1a5MKi4Uz50g7L7TbTK2SNiMguMbauPCcN5fJf47zVX6RhPUUHUXF6onky+Wnp7ftKlXRNq5Vbnwektl5lOdh28iP8AaIn3+Me6eTzSiuLMPa7HBUwpWnyq2b8Lk7U4ofdM6SzZdvtLUwnF0XNUt1NshtaSyb1Va09r6hM5XMaJuL4xqxfWZUwQ36E+rPazXNdpaeVUgvEPWQNXl18SKvhlm9+qhMnKceJZMW5x24l5+29hd0zq6YjlPOPZP8sBdNnUa23ZxR2GJypJd6tEeiOxmKLD3enyljIgW+Pdar+9cGWumHqT282tyW2FyrT2anZTc8osrvLev7TW/RMWwM3Ims83Eh865xXJ+DqW5mD2GHTMxzn8Xx6fJ2Ki3w+yK2GHGUc9M+jtKc9nSsO9VSTqnCNuE9K/4GhVOkLw9LVFV7EsNXKnBzmdWz0u4fxJPdDfT/tJsVoax7FbNdqiWtfnnuqu4zw3WIviRM1uk1fUW2x0nlVFZO1rW96qqMZ9qmwfSlog0/pi2WOlT3igpIqdnnRjUbn7Mkrsm3pE1OVfaDm61UWIn+/2YesACZcyAAAAAAAAAAAOHplqp5jkAQz2tWdbHtEvFFu4jdULUR/mS+X9iqqeBiC4Q+x6yaHGEa9cejsJRdKyzJFdrRfo2onsiN9LKqdrm+Uz7Fd6iN2qYd2qjnROEjcL6U/wKrkW+zyKoeht3MzvmzLN3x00n2xyn9NXjFLcWZYj07FwVR1mbvxOb3pwPymdJS1+jtLcwlr0I9Qe2OzmusMjkV9prV3EzyimTfT9tJDP/apB3oe6k9pNrcVsmcqU95p303PCJK3y2L+y5v0icOSw4lfFaj1OBbzYnd8+vTpVz+PX5sV9KTVLdM7Ibokcm7V3NEt9OmcLmRF318I0evghBW3x+W5+OCJhDO3TZ1X7Z66otLU8qrBaIesnanLrpURfHDN39ZTCNIzcganavFSNz7vFXMeXJ0LcnZ/Y40V1Rzq5/t+76nLGq5yNamVVcIcHo6ep+vuTHKnkxeWvp7PtI2Z0jV0FcmY6C3K53+jp4su8E4mSegnp+StvOpNa1LFVWo2hgcreCuevWS4XvREjT6RhzX1Z7HsfsdrsOqXo36KcXfwJmdGrTKaU2OWGjkjSOqqofZtVwwqyTeXhfOjVa36JIbKta1ccucb/AGfwWYsRPX+/32smAAnnJAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYZ6VFlWq0lRXyJqK63VKMlXHHq5cN/t9WRZ1NTrLQpM1PKhdlfzV5/wJ66stFNf9N3CzVbUWGsp3wuXHLeTCL6UXC+BCGspJ4pKmgr41jqIXvp6li/FkaqtenrRSA2pa4K4uR4uvfZ9tHtMWvEqnnTOseyf2n9Vgg+lTC6Cd8L/hMcqKfM0XQ3XT91q9NaooL1b3YqaCpZURccI7dXOF8y8UXzKpsIm1pam7Mna5iej7eltWuRN9Mqm5vbmflZ8n0mvC4RKrUenNvP0F8R6x1HN0f59Jth6y00t4j6yobIm9Gx7XSNicznuuka5yO5ZaqEliZHZxMf3VznejYkZN63VHLSqIn2SsitrKm832qudY7fqKqd9RK7vc5yuX7VKgprdHuxrIvN3L0FT5jQuTrK87PsRZsxHn/YEUuzTsHU2xiqnlSrvr/AtmkgdU1UcDeb3Inh2l13eqbbrTNUphOqjwxPyuTU9eDBXz0phuV1xRTNVXSHq7ALO7V/SJoJNxJKOz71XIqplESJMM9crmk605kaOghphabTV71dUxr1twqEpKdzk49XFxeqeZXux9AkunBSz4dvs7UQ8/by5s5efXV5cnYAG0gAAAAAAAAAAAAABjzpAWZbxs0uDoo9+ai3auPhlcMXy8fQVxDvUMHXWx6omXRqj09Hb9hP6tp4aukmo6hiPimY6ORq8laqYVPUpB7UNrfZ73cLLUIqrR1ElM7KY3kaqoi+LcL4kHte3w1U3Y9jq32dZ/FbuYlU9J4o9k8p/SPixsD7VkDqaqkgdzY5U8Ow+JHOmKeirKmzX2ludG7cqKWdlRC7uc1yOT7UNh0OtbU7ZkzXUj0Zb1tqVzk304Jub25n5WeHpNeFwj3o0k7W8/QXtFrO/u2BS6Rhjatsju7evmSVFc1j2rIyNWc0asjHu3uSqip2EjiZHBE+xzrenYsZd23MctKvlPX+Fo366VepdUXC9XB2amuqH1EnHKN3lzhPMnBE8yIclNb49xiyrzdy9BUmjcq1lddnY8WLMUxGn7eDnkXNpmn6qhWZyYdKuU/NTl/EtynidUTshZ8J7kRC7q2eK22uSdU97giy1O/HBE8VwYK515Q3qqoppmqekKHTtndrnbPYdMNaklN7KYydMZTq2++TfstVDYWxrWNRqIiIicEQib0FNLPq7rfdc1se8rP8ypXqnN7sPlVPDcT6Skte0smDa7O1Dgu9WfOXnT5R/f00cgA3VZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABx2kUukfp1ti2je2ELN2lvkK1LcJwSePdbKniixu9O8pKxeeTHPSD0nLqrZ3VpQRdZdbY72dQtRMq98aLvR/TYrm+lU7jUzLHbWpp8fBPbtbT/AMbtCi7M/hnlPsn9uqGOqaXD2VbE4O8h/p7FPCL0Rae5W5HNXehqI0c1e1M8vFP4FoVUL6eofDImHMXHp85Wbc+EvQVNUVRxUvk5EdlFTKKfWwXO5WRl2oaXqpKS7Uq01XFPHvsVuUc16J2PY5EVruxfSfLtGEznHEz01zT0auVh2sqIi5GukuGojURETCIcg7wRPnmZDGmXvXCIfDbjk9vS1Ll0lW5OCeQz09qlBr6plqJqSy0rHSTSvRysbzc5V3WN8VX9xcreot1vy927DAxXOd6Oa+J6XRY0vLrjbS2+VcauobOvs6XKcOsRcQs9flfQU+8S1N27qr+8m0KcPDq18f0/meSYuy7S8OjdAWbTcKN/zKmayRzeT5V8qR3i9XL4lzhMDgWmI0jSHn+uua6pqq6y5AB+vwAAAAAAAAAAAAAde3PcRj6UFiS2a4pb1EiJDeIFR+P+PCiIvrYrf1FJO+fsMebf9LS6o2cV0VDGslyoFSuompzfJGiqrPpsV7PpGrmWe2szT4pzdzaX+O2hbvTPLpPsn9uqF2qaXDo6tqcF8h/p7FPBL0d1Fxt+WO3oZ40cx3dnii+lCzqiJ8Ez4ZEw9i4VCsUT4S9CxVFUcUPm5Ec1WqmUVMHex19daYbrb4EilpbrTpBUsmbvJhHtex7eKYe1zeC9mV7zr2jCb2ccTPTXNPRqZOHaydOONdJcIiIiIiYRDkH1pYX1FQyGNMueuPR5z4bfR7Ol6XL31b04N8hnp7VKDaHXOVkFqhRzpJFR72tTKr2Nb4r/AALlVae225XOXdhgjVXL6Ofiv8Ss6L2lJtfbZWXiui3rfaHJXT5TLVei4hj/AFkz6GKfWJam7d1QO8e0acLEq18Y+X89EvNiej49D7NbPp9GolRFCklU7Hwp3+VIvgq4TzIhexwi9hzzLVEREaQ8/Xbk3a5rq6zzcgA/XyAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAcOTgpyAIX7btKroLaZPDHC6OxX17qqgfu+RFO5ffYM8k4+UidzkLHvdtStj6yNESdicM/GTuJo7ZNB0O0PQlXp+qVsc/wDpqKocir1E7UXdfw7OKoqdyqQiZW3DTl7qdL6thfSXGhlWFzn8uHLK9qKmFR3JUVFK9tDEmivtKOkuxbm7x0X7EYt+fxU8on1eDwpGOjerHtVrmrhUVOKHUvOsoaStajpWI5VTyXsXjj09pQLp6m3uFRNjuwhHxcjxdAW41Fc5GtRVVVwiJ2lz2G2rSs6+dPfnJhE+Qn8ypobdSUa70TMv+W5cqn8jw9UanipWOprc9JJ1TDpWrlrPR3r+4RxXJ4aWDIybePRx1ypNf3ZHKlppn5wqLOqdq9jf4r4E0+jHs/foHZrTQ10W5drjirrkVPKY5yJuxL+Y3CelXEdOiRstqNW6sj1jeoFSyWubfiSVuUq6hOKImebWLhzl78J34m/6CwYGPFunVxfe3bM5d7son2/SP74uwAJFTAAAAAAAAAAAAAAAAA4cmUU5AEL9s+l3aF2l1NCjFZaL099dbHImGseq5mgTuw5conc5CxL9bVqmdfAnvzUwqfLT+ZMrbps/g2jaDqbMj2QXGByVFvqXJ/opm8srz3XJlq+nPYhCyhutTQXGew6lgfb7pSSLDK2ZN3Lk4Yd3L5+S80K7tDFm3c7SjpLsu5u8NGTjxjX5/HTy9seDwXIrXK1yKiouFRew4LxrrdSVi70rMP8AltXCr/Mok09Tb3Gomx3YQ0IuQvq3o2OlejGNVznLhEROKl0WW2pRR9ZIiLO9OOPip3FRR0NJRNV0TEaqJ5T3rxx6ewtrVGqmNjfR2uTec7g+ZOSJ3N8/n9QiKrs6UtbJyreNRxVz/Kn1xdlq6htoosyNa5Os3Eyr39jU78fv9BNvo1bPk2f7NaSmqoty7XDFXcMpxa9yJux/QbhPTvL2mAeh7solv18i19fqb/wqgkzQMkav+c1DV4SJ3tYvHPa7HyVJnJwLDg48W6dXFt7NszmXptRPTr9I9zsACQU8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABwYt27bH7LtOtbZFe2332mZikrmsz5PFerkT4zFVfSi8U7UXKQPmqmKo0lks3rliuLludJhrd1ppPX2zO5OorzTVVHDvYjqGe+Us3nY7G74LhU7UQ8lusrujN1Ep3Lj4XVcf34NmFXT09ZTPgqqeKoiemHxytRzXJ50XgpYt32LbLbrULUVWirUki81gjWBF9KRq1FI+5s+mqdYXPD3yu2qOG5E+6fpLXvW3e7XFyQT1c0iPVESJvBFXsTdTmZm2JdHfUerK2G5atp6qx2JvlLHI3cqan8lrV4savynJ6EXmkvNL6A0XpjcdYtL2qgkZylipm9b+uuXL6y6OCJ5jLawqaerS2hvTevxMW4mNfGZ1lQWG12+y2imtdrpIaSipY0iggibutY1OSJ/Pt5leoyc8zdVWZmZ1kAAAAAAAAAAAAAAAAAAAAAcGHOkHsTtm0ilW6W58Vu1JBHuxVKt97qGpyjlxx9Dk4pntTgZjHE+aqIrjSWXHyLmPci5bnSYa1NTWbXez2vW3XyirrZhypH1rd6CXzsfxa5PQpRLrG8KzdRKdFx8JIuP78Gy240NDcqVaW4UdPVwP+FFPE2Ri+lFRULEuexDZVX1Tqmo0VbGyO5pCj4W/qscifYR1ezqZnWNFzxd87lFHDcifdPL4T0a+6q4Xe7TMpnzz1L3uwyFiZ3l7ka3n6jPWw7o23e9VFPfdeQyWy0tckjbe7LaioROx//DYvb8ZU+TzJX6Z0XpPTKJ+L+m7XbnImN+npWNevpdjeXxUuEzWsOmjqj9obz3siJptxpr4zOsqago6agooKKjgjp6aCNscUUbd1rGNTCNRE5IiFUAbqrzOoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABwqonNUQDkHXrI/lt9Y6yP5bfWH7pLsDr1kfy2+sdZH8tvrBpLsDr1kfy2+sdZH8tvrBpLsDr1kfy2+sdZH8tvrBpLsDr1kfy2+sdZH8tvrBpLsDr1kfy2+sdZH8tvrBpLsDr1kfy2+sdZH8tvrBpLsDr1kfy2+sdZH8tvrBpLsDr1kfy2+sdZH8tvrBpLsDr1kfy2+sdZH8tvrBpLsDr1kfy2+sdZH8tvrBpLsDr1kfy2+sdZH8tvrBpLsDr1kfy2+sdZH8tvrBpLsDr1kfy2+sdZH8tvrBpLsDr1kfy2+sdZH8tvrBpLsDr1kfy2+sdZH8tvrBpLsDr1kfy2+sdZH8tvrBpLsDr1kfy2+sdZH8tvrBpLsDr1kfy2+sdZH8tvrBpLsDr1jPlt9ZyiovJUUPzRyAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4VCztqWgrTtCsUFou9TWU8EFU2pa6le1rt9GuaiKrmuTGHr2dxeHDHM5U/JiJjSejJau12a4uW50mOksEe5e0P886i+vh+6HuXtD/ADzqL6+H7ozsDF3a36KT+8G0vzqmCfcvaH+edRfXw/dD3L2h/nnUX18P3RnYH53a36L9+8G0vzqmCfcvaH+edRfXw/dD3L2h/nnUX18P3RnYDu1v0T7wbS/OqYJ9y9of551F9fD90PcvaH+edRfXw/dGdgO7W/RPvBtL86pgn3L2h/nnUX18P3Q9y9of551F9fD90Z2A7tb9E+8G0vzqmCfcvaH+edRfXw/dD3L2h/nnUX18P3RnYDu1v0T7wbS/OqYJ9y9of551F9fD90PcvaH+edRfXw/dGdgO7W/RPvBtL86pgn3L2h/nnUX18P3Q9y9of551F9fD90Z2A7tb9E+8G0vzqmCfcvaH+edRfXw/dD3L2h/nnUX18P3RnYDu1v0T7wbS/OqYJ9y9of551F9fD90PcvaH+edRfXw/dGdgO7W/RPvBtL86pgn3L2h/nnUX18P3Q9y9of551F9fD90Z2A7tb9E+8G0vzqmCfcvaH+edRfXw/dD3L2h/nnUX18P3RnYDu1v0T7wbS/OqYJ9y9of551F9fD90PcvaH+edRfXw/dGdgO7W/RPvBtL86pgn3L2h/nnUX18P3Q9y9of551F9fD90Z2A7tb9E+8G0vzqmCfcvaH+edRfXw/dD3L2h/nnUX18P3RnYDu1v0T7wbS/OqYJ9y9of551F9fD90PcvaH+edRfXw/dGdgO7W/RPvBtL86pgn3L2h/nnUX18P3Q9y9of551F9fD90Z2A7tb9E+8G0vzqmCfcvaH+edRfXw/dD3L2h/nnUX18P3RnYDu1v0T7wbS/OqYJ9y9of551F9fD90PcvaH+eNRfXw/dGdgO7W/RPvBtL86pglei9of551F9fD90ZG2W6BtOz2xz2i0VNbUQz1Lqlzqp7XP33Ma1URWtamMMTs7y8UB9U2aKJ1pjSWvk7VzMqjs71yao8pcgAyo8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALZ2kawodCaOrtU3OiuFbRUKMWaOhYx8qNc5G7yI5zUwiuTPHgnEuY83Utoo9QafuNjuDd+kuFNJTTJ+Q9qtXHn4gYC92Lsy+YtX/ANUpvvzP+nbrR3yw2+9296vpLhTR1MDl5qx7Uc3Pnwpqn1XZazTeprnp+4N3aq3VUlNLw4K5jlblPMuMp5lJ3dB3Vf4wbForTNLvVViqn0ioq8Vid75Gvow5zU/MAz0AeHrrUFPpXRl41HVIixW2ilqVaq/DVrVVG+lVwniBiPWvSm2d6U1Xc9OVlt1HV1VtqHU00tJTwOiV7Vw5Gq6ZqrhcpxROKKXfsX2waf2rpc36ctd7pYrb1aTS18MTGuc/ew1u5I7K4aqryxw7zWpcKuor6+or6uRZaipldNK9ebnuVVVfFVU2KdETR34n7EbQk8XV113zc6nKcffETq08I0Zw78geftF6TWhNC6zuOlLvaNST11vcxsr6WngdE5XMa9N1XTNXk5OaIXHsV2z6W2sz3SHTtBeKV1sbE6Za+GNiOSRXIm7uSPz8Bc5x2EJ+lx/SK1b+mg/u8Rl/8HL/AK01r+ho/wC1MBJ3ahra17PdGVeq71T1tRQ0jo2yMpGNdKqvejEwjnNTm5O0wz7sXZl8xav/AKpTfflz9Nb+jrfv01J/eIzXYBOz3YuzL5i1f/VKb787N6YuzFVwtk1c3zrSU/35imn6HWtZ6eOZuqtPIkjEciKk3DKZ+QJ+htrxsSrBqfTcj8cGvdO1F8erX9wGetL9JzZFe52U8l9qbTM9cNS40ro258727zG+lVRDMFDV0tfRxVlFUw1VNM1HxzQyI9j2ryVrk4KnnQ1cbTtnuqdnN+bZ9U0CU0sjOsgljej4p2ZxvMcnPjzRcKnaiZMrdCzaZddN7RqLRlVVyS2G9SLCkD3ZbBUKiqx7E7N5URqonPeRexAJ9GD9ovSa0JoXWdx0pd7RqSeut7mNlfS08DonK5jXpuq6Zq8nJzRDOBra6XH9IrVv6aD+7xASW92Lsy+YtX/1Sm+/HuxdmXzFq/8AqlN9+RW2MbIdTbV57pDpystNM62tidN7OlkYjkkVyJu7jHZ+Auc47DJPuPNp3zzpL+t1H3AGZabpgbL5nI19s1VTp8qSjhVE/VmVTJOz7bHs411UNpNPampZK13KjqEdBM5eeGteib/0ckPr/wBE/ava6KSppo7Jd1YmVhoq1esVPMkjGIvoyYOqYa213KSnqIp6KtpZVa9j0VkkUjV4oqc2uRU8ANuYI/dDLatcNfaTrLFqCpdU3qy7ieyXrl9TTuyjXOXtc1Wq1V7ctVcqqqSBAGO9tG1zS+yejttRqOG41LrhI9kENDGx8mGIiucqPe1N1N5qc+aoZENePTT1j+NG2qtoKeXforDGlviRF4LIi70q+nfVW/QQDP8A7sXZl8xav/qlN9+Zv0Bqm1a20hbdU2XrUoLhEskTZkRJG4crXNciKqI5HIqLhV4pzNXFysNzt9gtN8qoFZQ3brvYkny+qejH+pVQl3+D41h7L09fND1MuZaGVK+kaq8eqkw2RE8zXo1fTIBKwj7qHpYbOrHf7lZauy6qfUW+qlpZXRUtOrHPjerVVqrMi4yi4yiEgiFGuOidtFvmtL5eqS86WZT3C41FVE2WqnR6Mkkc5EciQqmcKmcKoGSPdi7MvmLV/wDVKb78e7F2ZfMWr/6pTffmIPcc7TvnvSH9bqPuDAGobXUWO/3Gy1b4n1FvqpaWV0SqrFfG9WqrVVEXGUXGUQCb3uxdmXzFq/8AqlN9+Pdi7MvmLV/9UpvvyNGxvYRq/app+rvenrjY6anpapaV7a6eVj1ejGuyiMjcmMOTt7y+Pcc7TvnvSH9bqPuAJZ7Gtp1h2qafq71p6juVLT0lUtLI2ujYx6vRjXZRGPcmMOTtL3mlZFG6WV7WMYiuc5y4RqJzVV7jEXRX2Y3/AGWaLudl1BV2ypqKq4rVRuoZHvYjOrY3Cq9jVzlq9hGnpY7c6/Wd9q9IaZrnwaXo5FilfC7C3CRq4VzlTnGi/BbyXG8ueCIEh9f9J/ZfpapkoqStqtRVcaq1zbZGj4mr55XKjVTzt3jG9T006RsqpTbO55I+x0l3Ri+pIV/eRi2c6D1TtBvqWfStrkrZ2ojpX5RsUDflPevBqfavYiqSDtXQx1DLSNfdNb2ylqFTjHT0b5mov5yuYv2AXjp3pkaRqpmx33St4trXLhZKeZlS1vnXO4uPQi+gzvoDXukteW5a7Sl9pblGxE62Nqq2WLPy43Yc3xTC9hB7al0ZdoGirbNd6NaXUNtgar5n0O8k0TU5udE5M4T8lXY5rhDEukdSXzSV/pr7p64z2+4UzsslidjKdrXJyc1e1q5Re0DbKDGvR82o0e1TQsd3ayOmutK5ILlStXhHLjKObnjuOTinimVwqmSgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAII9PXR3tLtOo9VU0W7S3+m99VE4eyIURjvWxY1867x8+gTqv2n2r1Wm5pN2nv1GrWNzwWeHL2fsdanihI7pg6O/G7YldJIIt+usypc6fCccRovWJ9Wr1x2qiEAdDX+o0rrKz6kpcrLba2KpRqL8NGuRVb6FTKeIG2Ijn09tV+0+yil03DLu1F+rEa9ueKwQ4e/8Ab6pPFSQdurKe4W+mr6SRJaapibNDInJzHIitXxRUIC9OPVXt9tpltMMm9S2GlZSIiLwWV3vki+nLmtX8wDGuxrST9c7T7DpdGuWKsq2+yVTm2Bvlyr+o12PPg2kxRMhiZFExrI2NRrWtTCNROSIhD38Hto7rK2/66qYvJhalto3Knxlw+VU86J1aZ/KUmMBra6XH9IrVv6aD+7xGX/wcv+tNa/oaP+1MYg6XH9IrVv6aD+7xGX/wcv8ArTWv6Gj/ALUwGXumt/R1v36ak/vEZrsNifTW/o6379NSf3iM12AbcbT/AKrpP0LP7KFUasmbUNpjGoxm0TVzWtTCIl6qERE/XOs+0zaRPGsU+0HVkrHJhWvvNQqL4K8CRX4Q6+2ipn0xp+GeGa6Uiz1E7GKiugjejEaju5XK3OO5ue1DC3RbsVZf9u+loaSNzm0da2vncicI44fLVV7kVURvpchj6idS1V0Y+9VlZHBI/NRPDEk83HmqNc9qOX0uQnT0RZ9i1HbZqDQNynnv1QxHVvtm1I66RqccNb8HcTuYq44ZVV4gSGNbXS4/pFat/TQf3eI2Smtrpcf0itW/poP7vEBl/wDBy/601r+ho/7UxMY1u9HXbM7ZBVXqdunEvXtoyFmFrfY/VdWr1+Q7Od/zcjMXu1pP/LVv/rf/APQBMA14dNqG3w9IG6+wUY2SSlpn1SM/4qxpz86t3F8S+9Q9MzUFTQyR2LRdBbalyYbPU1rqlGedGoxnH0rjzKRpvFyu+ptQ1FzuM89xutwnV8j1TefLI5eSInqRE8yIBIH8Hq2ddrV7c3e6hLDIkndvLPDu+OEd9pOkwR0PNlNbs80XU3S/0/U329qx80Dk8qmhai7ka9zl3lc5POiLxaZ3AtzaVqWm0boK96oqt1WW6jfM1rl4PkxhjPpOVrfE1YyyV14u75XrJVV1bOrnLzdLK9371VftJmfhBNY+wdJWbRVNLia5zrWVbUXj1MXBiL5nPXP/ANMwX0PdI/jZtwtL5ot+js6Lc58pwzGqdWn1jmLjuRQM69JnZXFa+i5YqOiia+q0e2GSVzE+G16btQqel7kevmaRv6NesfxI2zWC7Sy9XRTzewq1VXCdTL5Cqvmaqtf9E2SaitNJftP3CyV7N+kuFLJTTN72ParV+xTVNqizVendS3Kw17d2qt1VJSy8OG8xytVU8y4yBtpBjzo7ax/HnY/YL5LL1lYlOlLWqq5Xr4vIcq+d2Ef6HIZDAGqraz/tU1b/AM7rf+u82qmqraz/ALVNW/8AO63/AK7wJf8A4PT/AGVX7/njv+hCSWI0/g9P9lV+/wCeO/6EJJYDGPSf1VNpHYhqG50kqx1k8CUVM5FwqPmcjFci96NVzk9BrSJ3/hA5nx7FbaxiqiS3+Br/ADp1E7v3ohCXR9PHV6ts9LMjVimr4I3o7lhZGoufWBsd6Omz6k2ebL7Za0p2suVVE2rucmPKfO9qKrVXuZ8FPRnmqmSQABrv6Y2z6l0LtWdUWunbBa73EtbBGxMNik3lSVjU7E3sOROSI9ETkbECJn4RinjdaNGVSo3rWVFXGi9uHNiVf7KAYu6D2qprBtsprQ6VW0d+p5KSVqr5PWNaskbvTlqtT89TYIautgs0kG2zRL487y32jYuO50zWr9iqbRQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPjUQxTwyQTMbJFI1WPY5Mo5qphUVO41abXtKS6H2lX7TD2uSOhq3JTq7m6F3lRO8WOaptRIbfhCdHdTcrFruliwyoYttrHInDfbl8Sr51b1iehiAZU6KuvKas6NsV0ucyr+LEM9NVuzxSOBvWM9USsTwUgTqO61d/1Fcb3Wu36u4VUlTMvPL3uVy/apeegNoU2m9lWu9INke11/ipkgXsarZMSp9KNVTwKzou6O/HXbVY6CaLrKKik9sKxFTKdXEqORF8zn7jfpATv2BaOTQ2ySwaeki6urZTJPW8OPXyeW9F78K7d9DUL9AA1tdLj+kVq39NB/d4jL/4OX/Wmtf0NH/amMQdLj+kVq39NB/d4jL/AODl/wBaa1/Q0f8AamAy901v6Ot+/TUn94jNdhsT6a39HW/fpqT+8RmuwDalbdE6MdbaVztI2BVWFiqq22HjwT8k+7tDaJc1Wu0dp5yLzRbZD/2lPbdcaKbbaVrtX6eRUhYiotyh4cE/KPu7Xeh2oqu1lp1ETtW5w/8AcBhvpHbAdD3TQV4v2nLHSWO92ylkrI1oY0iinbG1XOjdG3yeKIuFREXOOOMoQWs9yr7PdaW62urlpK6klbNBPE7Do3tXKKhOrpI7e9E2zZ/eLDpy+0d8vVzpZKOJtDIk0UDZGq10jpG5blEVcIiquccMZUgUiKq4TioG1PZTqZdY7OLBqd7GsluNDHLM1vwWyYw9E828jsEAulx/SK1b+mg/u8ROzYNYKrTGx3S1kro3R1dPb2OnjcmFjkfl7mr50Vyp4EE+lx/SK1b+mg/u8QHfo57Gv8r9Ve4Pxk9pPatkL8+wfZHW9Yr0/wCIzGNzz5yZk9xT/wDuX/8Agv8A/QU/4OX/AFprX9DR/wBqYmMBqp2n6NumgNcXLSt2Teno5MMlRuGzxrxZI3zOTC47FynNCRnQHuuip66tsdbYrdHqyFXVNFcHs3pZoeT2NV2d1zefk4y1fyVUyH019l344aJTV1pp1ferDG50iMTyqik5vb51Zxenm305qhB/Sl+uel9SW/UNmqFp6+gnbNA9OWU7FTtRUyip2oqoBtnBaWyTW9s2h6Et2qLWqNbUM3aiHeysEzeD419C8l7UVF7Tz9vmsE0Nskv+oY5erq46ZYaNc8evk8iNU78K7e9DVAgh0odYfjptqvtwhl6yio5Pa+jVFynVw5aqp5nP33fSLd2c7SNZ7PJq2bR93bbJK5rG1DvYkMyvRuVamZGOwnlLyxnhnkhasbJJpmxxtdJI9yNa1EyrlXknpNhWjujZsvpNK2umv2k4K26x0kSVtQtVOnWTbqb64a9ERN7OMdgEUfdMbbf/AJ1//F0f3RjXVuobvqvUVXqC/VTau5VjkdUTNhZFvqjUai7rERqLhE5Jx5rxNiHuddi//wAj039cqPvDEHSw2F6L07som1LorT7bbVW2qjfVrHNLJ1kDl3FTD3Lyc5i5TsRQPK/B7ax6i637QtTLhlSxLjRtVeG+3DJUTzq1Y19DFJlGrDY/qyTQ+0yw6oY5yR0VW1ahG83Qu8mVPFjnG0qCWOeFk0L2yRvajmOauUci8UVFA+pqq2s/7VNW/wDO63/rvNqpqq2s/wC1TVv/ADut/wCu8CX/AOD0/wBlV+/547/oQkliNP4PT/ZVfv8Anjv+hCSWAwV05bTJc9gtXUxsV3tbcKerXCcUTKxKv/3TX/QVMtFXQVkKoksErZWKvymrlP3G1/V9jotTaXuenriiupLjTSU0uOaI9qplPOmcp50Q1cbQNK3bROsLjpi9QrHV0MqsV2MNlZzbI3va5MKnpA2maau1Jf8AT1uvlA9H0twpY6mFyLza9qOT956JCTol9IGg0na2aG1vUSRWtr1W3XBUV6U28uVikROO5lVVHJyVVReHFJi2nUmnrtRtrLXfLZXU7kyktPVskaqelFA9Yhf+ERv0M+o9L6bikastHTTVc7U7Otc1rM/VOXxJA7UtuGz/AEDbZpKu90lyuLWr1NtoZmyzPd2I7dykaed2PNleBry2haru2t9Y3LU95kR1XXS76tb8GJicGxt/Ja1ERPR3gXf0V7NLe9vulIGMVzaar9mSKnJrYWrJlfFqJ4obLSKvQM2bT2q0Vu0O70yxzXOP2NbGvbhyU+UV8noe5Gonmaq8nISqAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFgdIDR3497Ir9p+KLrKx1OtRRIiZXr4/LYifnKm76HKX+ANWf8Akt2m/wDlzq//ANEqf+wlr0F9nN10rYL5qPUdnrbXc7hO2lhgrad0MrII03lduuRFRHOd/wDbQkuAAAA1+9KHQGu7xt41RcrRorUtwoZ5oViqaW1TyxSIkEaLuua1UXiipw7jKfQK0pqnTVx1c/UWm7xZm1ENIkK19DJTpIrVlzu77UzjKZx3oSvAGIul1aLre9g96ttlttbc66SWmWOmpIHTSuRJ2KuGtRVXCIq+BBD/ACW7Tf8Ay51f/wCiVP8A2G0wAas/8lu03/y51f8A+iVP/Ycpss2nKv8As51f/wCi1H/YbSwBrNsewna5eJmx02hLtBlcK6tYlM1PPmVWkktgXRbp9MXWl1NrurprncaZ6S01vp8up4npxa57lRFe5F44wiIqfGJQAAa/elDoDXd428aouVo0VqW4UM80KxVNLap5YpESCNF3XNaqLxRU4dxsCAEUOgVpTVOmrjq5+otN3izNqIaRIVr6GSnSRWrLnd32pnGUzjvQleAB1c1HNVrkRUVMKi9pr96RewjU+ndpFW7RmlrxdrDcM1VL7XUMk6U28vlQu3Gru7q/Bz8VU5qimwQAQj6Ic20zZ7rlbTedC6uh03enNjqXSWaoRlNNyZNxZhE+K5e5cr8FC+OnZDrPUcVh0npnSuoLtRRq6vrJqG3TTx9ZxZG3eY1UyidYqp+U0lIANe/Ru2QawrNstgm1Lo+/Wu1UE/s6eaut0sMarEm8xmXtRFVXoxMd2TYQAAPI1fZaTUul7pp+u/8AhrjSS0si4zhHtVuU86ZynnQ9cAauK7ZNtNpK2elXZ/qmVYZHRrJDaKh7H4XGWuRmFRccFTmT46Mlw1BV7GrLSaos90td1trFoJY6+lkgkeyPCRvRHoiqisViZ70d3GTwANau07ZrtGrNpOqKuk0Bquop57xVyRSxWeocyRjpnqjmqjMKioqKiobKgBHroLafv+nNml5pNQ2S5WeokvLpGRV1I+B7mdTEm8iPRFVMoqZ8ykhQABi7bzsZ07tWtDG1bva+90rFbR3KNm85qc9x6cN9meOMoqLxRUyucogDWrtB2B7UNG1MiVOmqm6UbVXdrLWxamNyd6o1N5n0moY1qaOrppupqaWeGTONySNWu9Sm3QAaptNaG1lqWdkNh0teLirlwjoKR6sT0uxuonnVSS2w7on1TK6nve058LYY1R7LNBJvq9e6aROCJ+S1Vz3pyWYYA+FPBDT08dPTxMihiajGRsajWsaiYREROCIidh9wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/2Q==";
    if(!existing)document.head.appendChild(link);
  },[qi.opp,showDashboard]);


  // ── Sync noise compBudget when level changes or quote loads ────────────────
  useEffect(()=>{
    const COMP_COST_EFF={"<=140dB":0,"145dB":750,"150dB":1500,"155dB":1500,"160dB":1500,"165dB":2000,"170dB":3500};
    const anyNeedsSync=noises.some(n=>{
      if(!n.on)return false;
      const ac=COMP_COST_EFF[n.level]||0;
      return ac>0&&(n.compBudget==="0"||!n.compBudget);
    });
    if(!anyNeedsSync)return;
    setNoises(prev=>prev.map(n=>{
      if(!n.on)return n;
      const ac=COMP_COST_EFF[n.level]||0;
      if(ac>0&&(n.compBudget==="0"||!n.compBudget)){
        return {...n,
          compBudget:String(ac),
          testing:String(noiseTestingPrice(n.durVal,n.durUnit,n.level,ac))
        };
      }
      return n;
    }));
  },[noises]); // watches all noise changes

  // ── Persist last open quote ID to localStorage ───────────────────────────
  // Only update localStorage when we have a real ID — don't clear it on null
  // (clearing happens explicitly in handleNewQuote and handleDeleteQuote)
  useEffect(()=>{
    if(currentQuoteId){
      localStorage.setItem("vibrato_last_quote_id",String(currentQuoteId));
      // Load sent status for this quote
      supabase.from("follow_ups")
        .select("sent_at,sent_by")
        .eq("quote_id",currentQuoteId)
        .neq("sent_by","salesforce_import")
        .order("sent_at",{ascending:false})
        .limit(1)
        .maybeSingle()
        .then(({data})=>setQuoteSentAt(data?.sent_at||null));
      // Load flag
      supabase.from("quote_flags")
        .select("id,note,flagged_by,flagged_at")
        .eq("quote_id",currentQuoteId)
        .eq("resolved",false)
        .maybeSingle()
        .then(({data,error})=>{ if(!error){setQuoteFlag(data||null);setFlagNote(data?.note||"");} })
        .catch(()=>{});
    } else {
      setQuoteSentAt(null);
      setQuoteFlag(null);
      setFlagNote("");
    }
  },[currentQuoteId]);

  // ── Browser back/forward button handler ────────────────────────────────────
  useEffect(()=>{
    const onPop=(e)=>{
      const state=e.state;
      if(state&&typeof state.showDashboard==="boolean"){
        setShowDashboard(state.showDashboard);
      }
    };
    window.addEventListener("popstate",onPop);
    return ()=>window.removeEventListener("popstate",onPop);
  },[]);

  // ── Load saved quotes on startup + Supabase Realtime sync ──────────────────
  useEffect(()=>{
    loadQuotesFromSupabase().then(q=>setSavedQuotes(q));
    loadPendingQuotes().then(q=>setSavedQuotes(prev=>({...prev,...q})));

    const channel=supabase
      .channel("quotes-realtime")
      .on("postgres_changes",
        {event:"*", schema:"public", table:"quotes"},
        (payload)=>{
          loadPendingQuotes().then(fresh=>{
            setSavedQuotes(prev=>{
              const cleaned={...prev};
              Object.entries(cleaned).forEach(([id,q])=>{
                const wasPending=q.approval?.status==="pending"||q.wonApproval?.status==="pending_won";
                if(wasPending&&!fresh[id])delete cleaned[id];
              });
              return {...cleaned,...fresh};
            });
          });
          loadQuotesFromSupabase().then(q=>setSavedQuotes(prev=>({...prev,...q})));
          setDashboardNeedsRefresh(prev=>prev||true);
          setCurrentQuoteId(prevId=>{
            if(prevId&&String(payload.new?.id)===String(prevId)){
              // Only show if this wasn't our own save (grace window of 5 seconds)
              const msSinceSave=Date.now()-recentSaveRef.current;
              if(msSinceSave>5000){
                showToast(
                  <span>
                    ⚠️ This quote was updated by another user.{" "}
                    <span
                      onClick={()=>reloadOpenQuoteRef.current&&reloadOpenQuoteRef.current(String(prevId))}
                      style={{textDecoration:"underline",cursor:"pointer",fontWeight:700}}>
                      Reload quote
                    </span>
                  </span>,
                  "info", 10000
                );
              }
            }
            return prevId;
          });
        }
      )
      .subscribe();

    return ()=>{ supabase.removeChannel(channel); };
  },[]);

  // ── Refresh pending quotes every time dashboard becomes visible ──────────────
  useEffect(()=>{
    if(showDashboard){
      setDashboardNeedsRefresh(false);
      loadPendingQuotes().then(fresh=>{
        setSavedQuotes(prev=>{
          // Remove any previously-pending quotes that are no longer pending,
          // then merge in the freshly fetched ones
          const cleaned={...prev};
          Object.entries(cleaned).forEach(([id,q])=>{
            const wasQueuePending=q.approval?.status==="pending";
            const wasWonPending=q.wonApproval?.status==="pending_won";
            const stillInFresh=fresh[id];
            if((wasQueuePending||wasWonPending)&&!stillInFresh){
              // Re-fetch this quote's current state from fresh data or drop it
              delete cleaned[id];
            }
          });
          return {...cleaned,...fresh};
        });
      });
    }
  },[showDashboard]);

  const loadEmailJS=()=>new Promise((res,rej)=>{
    if(window.emailjs){res();return;}
    const s=document.createElement("script");
    s.src="https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js";
    s.onload=()=>{window.emailjs.init(EMAILJS_PUBLIC_KEY);res();}
    s.onerror=rej;
    document.head.appendChild(s);
  });

  const sendSubmitEmail=async(submitter)=>{
    try{
      await loadEmailJS();
      await window.emailjs.send(EMAILJS_SERVICE_ID,EMAILJS_SUBMIT_TPL,{
        quote_opp:   qi.opp||"Untitled",
        quote_rfq:   qi.rfq||"—",
        quote_total: money(displayTotal),
        submitted_by:submitter,
        submitted_at:new Date().toLocaleString(),
        to_email:    APPROVERS.map(a=>a.email).join(","),
      });
    }catch(e){console.warn("EmailJS submit failed:",e);}
  };

  const sendDecisionEmail=async(decision,decider,comments,submitter)=>{
    try{
      await loadEmailJS();
      await window.emailjs.send(EMAILJS_SERVICE_ID,EMAILJS_DECISION_TPL,{
        quote_opp:   qi.opp||"Untitled",
        quote_rfq:   qi.rfq||"—",
        quote_total: money(displayTotal),
        decision:    decision,
        decided_by:  decider,
        decided_at:  new Date().toLocaleString(),
        comments:    comments||"None",
        to_email:    submitter,
      });
    }catch(e){console.warn("EmailJS decision failed:",e);}
  };

  const handleSubmitApproval=async()=>{
    recentSaveRef.current=Date.now();
    const evt={event:"submitted",by:currentUser,at:new Date().toISOString(),comments:""};
    const newApproval={status:"pending",submittedBy:currentUser,submittedAt:new Date().toISOString(),decidedBy:"",decidedAt:"",comments:"",history:[...(approval.history||[]),evt]};
    setApproval(newApproval);
    setLocked(true);
    setShowApprovalModal(false);
    const snapshotLines=(summary.lines||[]).map((l,i)=>{
      const ov=lineOverrides[i]||{};
      if(ov.deleted)return null;
      return {...l, val: ov.price!==undefined ? sf(ov.price,0) : l.val};
    }).filter(Boolean);
    const savedSnapshot={
      lines: snapshotLines,
      total: displayTotal,
      tiSpecs: ti.tiSpecs||"",
      tiNotes: ti.tiNotes||"",
      savedAt: new Date().toISOString(),
    };
    const q={id:currentQuoteId||undefined,opp:qi.opp,customer:qi.account,rfq:qi.rfq,total:displayTotal,
      qi,ti,vibs,shocks,noises,envs,hfvs,shos,dcms,pqs,emis,abs,sbs,inst,ot,custom,budget,coc,sub,td,setup,globalPR,notes,splitProcReport,modalAnalysis,fixtureDrawing,inStockModal,wonInfo,approval:newApproval,chatterEntries,summary,lineOrder,lineOverrides,pickerLines,unifiedOrder,snapshot:savedSnapshot};
    const newId=await saveQuoteToSupabase(q,autoSpecs,autoNotes);
    if(newId){setCurrentQuoteId(newId);setSnapshot(savedSnapshot);setIsDirty(false);showToast("Submitted for approval","info");}
    else showToast("Submit failed — check your connection","error",5000);
    await sendSubmitEmail(currentUser);
  };


  const autoUnflag = async (qid) => {
    if(!qid) return;
    try {
      await supabase.from("quote_flags")
        .update({resolved:true,resolved_by:"auto_approval",resolved_at:new Date().toISOString()})
        .eq("quote_id",qid)
        .eq("resolved",false);
    } catch(e){ console.warn("Auto-unflag failed:",e); }
  };
  const handleApprove=async()=>{
    const evtA={event:"approved",by:currentUser,at:new Date().toISOString(),comments:approvalComments};
    const newApproval={...approval,status:"approved",decidedBy:currentUser,decidedAt:new Date().toISOString(),comments:approvalComments,history:[...(approval.history||[]),evtA]};
    setApproval(newApproval);
    setLocked(true);
    setApprovalComments("");
    const q={id:currentQuoteId||undefined,opp:qi.opp,customer:qi.account,rfq:qi.rfq,total:displayTotal,
      qi,ti,vibs,shocks,noises,envs,hfvs,shos,dcms,pqs,emis,abs,sbs,inst,ot,custom,budget,coc,sub,td,setup,globalPR,notes,splitProcReport,modalAnalysis,fixtureDrawing,inStockModal,wonInfo,approval:newApproval,chatterEntries,summary,lineOrder,lineOverrides,pickerLines,unifiedOrder};
    const newId=await saveQuoteToSupabase(q,autoSpecs,autoNotes);
    if(newId){setCurrentQuoteId(newId);showToast("Quote approved ✓","success");autoUnflag(newId);}
    else showToast("Save failed — check your connection","error",5000);
    await sendDecisionEmail("APPROVED",currentUser,approvalComments,approval.submittedBy);
  };

  const handleReject=async()=>{
    const evtR={event:"rejected",by:currentUser,at:new Date().toISOString(),comments:approvalComments};
    const newApproval={...approval,status:"rejected",decidedBy:currentUser,decidedAt:new Date().toISOString(),comments:approvalComments,history:[...(approval.history||[]),evtR]};
    setApproval(newApproval);
    setLocked(false);
    setApprovalComments("");
    const q={id:currentQuoteId||undefined,opp:qi.opp,customer:qi.account,rfq:qi.rfq,total:displayTotal,
      qi,ti,vibs,shocks,noises,envs,hfvs,shos,dcms,pqs,emis,abs,sbs,inst,ot,custom,budget,coc,sub,td,setup,globalPR,notes,splitProcReport,modalAnalysis,fixtureDrawing,inStockModal,wonInfo,approval:newApproval,chatterEntries,summary,lineOrder,lineOverrides,pickerLines,unifiedOrder};
    const newId=await saveQuoteToSupabase(q,autoSpecs,autoNotes);
    if(newId){setCurrentQuoteId(newId);showToast("Quote rejected","info");}
    else showToast("Save failed — check your connection","error",5000);
    await sendDecisionEmail("REJECTED",currentUser,approvalComments,approval.submittedBy);
  };

  const handleApproverUnlock=()=>{
    setLocked(false);
  };

  // ── Closed Won Approval ──────────────────────────────────────────────────────
  const handleSubmitWonApproval=async(explicitStage)=>{
    recentSaveRef.current=Date.now();
    const newWonApproval={status:"pending_won",submittedBy:currentUser,submittedAt:new Date().toISOString(),decidedBy:"",decidedAt:"",comments:""};
    setWonApproval(newWonApproval);
    setLocked(true);
    const effectiveQi=explicitStage?{...qi,stage:explicitStage}:qi;
    const snapshotLines=(summary.lines||[]).map((l,i)=>{
      const ov=lineOverrides[i]||{};
      if(ov.deleted)return null;
      return {...l, val: ov.price!==undefined ? sf(ov.price,0) : l.val};
    }).filter(Boolean);
    const savedSnapshot={
      lines: snapshotLines,
      total: displayTotal,
      tiSpecs: ti.tiSpecs||"",
      tiNotes: ti.tiNotes||"",
      savedAt: new Date().toISOString(),
    };
    const q={id:currentQuoteId||undefined,opp:effectiveQi.opp,customer:effectiveQi.account,rfq:effectiveQi.rfq,total:displayTotal,
      qi:effectiveQi,ti,vibs,shocks,noises,envs,hfvs,shos,dcms,pqs,emis,abs,sbs,inst,ot,custom,budget,coc,sub,td,setup,globalPR,notes,splitProcReport,modalAnalysis,fixtureDrawing,inStockModal,wonInfo,approval,wonApproval:newWonApproval,chatterEntries,summary,lineOrder,lineOverrides,pickerLines,unifiedOrder,snapshot:savedSnapshot};
    const newId=await saveQuoteToSupabase(q,autoSpecs,autoNotes);
    if(newId){setCurrentQuoteId(newId);setSnapshot(savedSnapshot);setIsDirty(false);showToast("Submitted for Closed Won approval","info");}
    else showToast("Submit failed — check your connection","error",5000);
  };

  const handleWonApprove=async(comments)=>{
    const newWonApproval={...wonApproval,status:"won_approved",decidedBy:currentUser,decidedAt:new Date().toISOString(),comments:comments||""};
    setWonApproval(newWonApproval);
    const q={id:currentQuoteId||undefined,opp:qi.opp,customer:qi.account,rfq:qi.rfq,total:displayTotal,
      qi,ti,vibs,shocks,noises,envs,hfvs,shos,dcms,pqs,emis,abs,sbs,inst,ot,custom,budget,coc,sub,td,setup,globalPR,notes,splitProcReport,modalAnalysis,fixtureDrawing,inStockModal,wonInfo,approval,wonApproval:newWonApproval,chatterEntries,summary,lineOrder,lineOverrides,pickerLines,unifiedOrder};
    const newId=await saveQuoteToSupabase(q,autoSpecs,autoNotes);
    if(newId){setCurrentQuoteId(newId);showToast("Closed Won approved ✓","success");}
    else showToast("Save failed — check your connection","error",5000);
  };

  const handleWonReject=async(comments)=>{
    const newWonApproval={...wonApproval,status:"won_rejected",decidedBy:currentUser,decidedAt:new Date().toISOString(),comments:comments||""};
    setWonApproval(newWonApproval);
    setLocked(false);
    const q={id:currentQuoteId||undefined,opp:qi.opp,customer:qi.account,rfq:qi.rfq,total:displayTotal,
      qi,ti,vibs,shocks,noises,envs,hfvs,shos,dcms,pqs,emis,abs,sbs,inst,ot,custom,budget,coc,sub,td,setup,globalPR,notes,splitProcReport,modalAnalysis,fixtureDrawing,inStockModal,wonInfo,approval,wonApproval:newWonApproval,chatterEntries,summary,lineOrder,lineOverrides,pickerLines,unifiedOrder};
    const newId=await saveQuoteToSupabase(q,autoSpecs,autoNotes);
    if(newId){setCurrentQuoteId(newId);showToast("Closed Won rejected","info");}
    else showToast("Save failed — check your connection","error",5000);
  };

  // ── Approval Queue (approver dashboard) ──
  const [queueSelected,setQueueSelected]=useState(new Set());
  const [queueComments,setQueueComments]=useState("");

  const pendingQuoteApprovals=Object.values(savedQuotes).filter(q=>q.approval?.status==="pending")
    .sort((a,b)=>new Date(b.approval?.submittedAt||0)-new Date(a.approval?.submittedAt||0));
  const pendingWonApprovals=Object.values(savedQuotes).filter(q=>q.wonApproval?.status==="pending_won")
    .sort((a,b)=>new Date(b.wonApproval?.submittedAt||0)-new Date(a.wonApproval?.submittedAt||0));
  const pendingQuotes=[...pendingQuoteApprovals,...pendingWonApprovals];

  const handleQueueDecision=async(decision,idsToProcess)=>{
    const now=new Date().toISOString();
    for(const id of idsToProcess){
      const q=savedQuotes[id];
      if(!q)continue;
      const isWon=q.wonApproval?.status==="pending_won";
      const evtQ={event:decision,by:currentUser,at:now,comments:queueComments};
      if(isWon){
        // Closed Won approval — update wonApproval, use won_approved/won_rejected statuses
        const wonStatus=decision==="approved"?"won_approved":"won_rejected";
        const newWonApproval={...q.wonApproval,status:wonStatus,decidedBy:currentUser,decidedAt:now,comments:queueComments,history:[...(q.wonApproval?.history||[]),evtQ]};
        await saveQuoteToSupabase({...q,wonApproval:newWonApproval,chatterEntries:q.chatterEntries||[]},autoSpecs,autoNotes);
        await sendDecisionEmail("CLOSED WON "+decision.toUpperCase(),currentUser,queueComments,q.wonApproval?.submittedBy||"");
        // If this quote is currently open in the form, sync its state
        if(currentQuoteId&&String(currentQuoteId)===String(id)){
          setWonApproval(newWonApproval);
        }
      } else {
        // Regular quote approval
        const newApproval={...q.approval,status:decision,decidedBy:currentUser,decidedAt:now,comments:queueComments,history:[...(q.approval?.history||[]),evtQ]};
        await saveQuoteToSupabase({...q,approval:newApproval,chatterEntries:q.chatterEntries||[]},autoSpecs,autoNotes);
        await sendDecisionEmail(decision.toUpperCase(),currentUser,queueComments,q.approval?.submittedBy||"");
        if(decision==="approved")await autoUnflag(id);
        // If this quote is currently open in the form, sync its state
        if(currentQuoteId&&String(currentQuoteId)===String(id)){
          const evtQL={event:decision,by:currentUser,at:now,comments:queueComments};
          const newApprovalL={...approval,status:decision,decidedBy:currentUser,decidedAt:now,comments:queueComments,history:[...(approval.history||[]),evtQL]};
          setApproval(newApprovalL);
          if(decision==="approved")setLocked(true);
          if(decision==="rejected")setLocked(false);
        }
      }
    }
    // Reload from Supabase to ensure UI is fully in sync
    const refreshed=await loadQuotesFromSupabase();
    setSavedQuotes(refreshed);
    setQueueSelected(new Set());
    setQueueComments("");
  };

  // ── Open Quotes panel handlers ───────────────────────────────────────────────
  const loadOpenQuotes=async()=>{
    setOpenQuotesLoading(true);
    const {data,error}=await supabase.from("open_quotes").select("*").order("sort_order",{ascending:true}).order("created_at",{ascending:true});
    if(!error)setOpenQuotesList(data||[]);
    setOpenQuotesLoading(false);
  };

  const addOpenQuoteRow=async()=>{
    setOpenQuotesList(prev=>{
      const maxOrder=prev.length>0?Math.max(...prev.map(r=>r.sort_order||0)):0;
      const optimistic={id:"temp-"+Date.now(),opportunity:"",account:"",description:"",sort_order:maxOrder+1};
      supabase.from("open_quotes").insert({opportunity:"",account:"",description:"",sort_order:maxOrder+1}).select().single()
        .then(({data,error})=>{
          if(error){alert("Could not add row: "+error.message);setOpenQuotesList(p=>p.filter(r=>r.id!==optimistic.id));return;}
          if(data)setOpenQuotesList(p=>p.map(r=>r.id===optimistic.id?data:r));
        });
      return [...prev,optimistic];
    });
  };

  const updateOpenQuoteRow=async(id,field,value)=>{
    setOpenQuotesList(prev=>prev.map(r=>r.id===id?{...r,[field]:value}:r));
    await supabase.from("open_quotes").update({[field]:value}).eq("id",id);
  };

  const deleteOpenQuoteRow=async(id)=>{
    setOpenQuotesList(prev=>prev.filter(r=>r.id!==id));
    await supabase.from("open_quotes").delete().eq("id",id);
  };

  const handleOpenQuoteDragStart=(id)=>{
    dragRowId.current=id;
  };

  const handleOpenQuoteDrop=async(targetId)=>{
    const fromId=dragRowId.current;
    if(!fromId||fromId===targetId)return;
    dragRowId.current=null;
    setDragOverId(null);
    setOpenQuotesList(prev=>{
      const list=[...prev];
      const fromIdx=list.findIndex(r=>r.id===fromId);
      const toIdx=list.findIndex(r=>r.id===targetId);
      if(fromIdx<0||toIdx<0)return prev;
      const [moved]=list.splice(fromIdx,1);
      list.splice(toIdx,0,moved);
      const reordered=list.map((r,i)=>({...r,sort_order:i+1}));
      // Persist all sort_orders to Supabase
      reordered.forEach(r=>{
        supabase.from("open_quotes").update({sort_order:r.sort_order}).eq("id",r.id);
      });
      return reordered;
    });
  };

  const handleOpenQuoteClick=async(row)=>{
    if(!row.opportunity.trim())return;
    // Only prompt to save if we're in the quote form with an active quote
    if(!showDashboard&&(qi.opp||currentQuoteId)){
      const result=window.confirm("Save the current quote before switching?\n\nClick OK to save, or Cancel to discard.");
      if(result){
        const q={id:currentQuoteId||undefined,opp:qi.opp,customer:qi.account,rfq:qi.rfq,total:displayTotal,
          qi,ti,vibs,shocks,noises,envs,hfvs,shos,dcms,pqs,emis,abs,sbs,inst,ot,custom,budget,coc,sub,td,setup,globalPR,notes,splitProcReport,modalAnalysis,fixtureDrawing,inStockModal,wonInfo,approval,wonApproval,chatterEntries,summary,lineOrder,lineOverrides,pickerLines,unifiedOrder};
        await saveQuoteToSupabase(q,autoSpecs,autoNotes);
      }
    }
    // Search Supabase directly by opportunity name
    const {data:matchData}=await supabase
      .from("quotes")
      .select("id, opportunity, customer, rfq, revision, stage, total, approval_status, won_approval_status, updated_at, data, source")
      .ilike("opportunity",row.opportunity.trim())
      .limit(1)
      .single();
    if(matchData){
      const q=matchData.data||{};
      // When loading from Reminders, treat as a Vibrato quote regardless of source
      // The user intentionally chose to work on this quote
      const match={...q,id:matchData.id,opp:matchData.opportunity||q.opp,
        customer:matchData.customer||q.customer,rfq:matchData.rfq||q.rfq,
        total:matchData.total??q.total,savedAt:matchData.updated_at,
        source:"vibrato",
        approval:{...(q.approval||{}),status:matchData.approval_status||q.approval?.status||"none"}};
      handleLoad(match);
      setOpenQuotesPanel(false);
      navigateTo(false);
    } else {
      const create=window.confirm("No quote found for \""+row.opportunity+"\"\n\nWould you like to create a new quote with this opportunity number?");
      if(create){
        setQi({opp:row.opportunity,account:row.account||"",billTo:"",billToCity:"",contact:"",email:"",prepby:"",rev:"",revDate:"",date:new Date().toLocaleDateString("en-US"),rfq:"",stage:"Proposal/Price Quote",type:"New Business",relatedOpps:""});
        setTi({item:"",qty:"1",model:"",drawing:"",loads:null,dimL:"",dimW:"",dimH:"",wt:"",volt:"",pwrType:"AC",phase:"",hz:"",inrush:"",amps:"",mounting:"",pressureFlow:"",gsi:"Unknown",witness:"Unknown",docRestriction:"None",dpas:"",tiSpecs:"",tiNotes:""});
        setVibs([newVib()]);setShocks([newShock()]);setNoises([newNoise()]);setEnvs([newEnv()]);
        setHfvs([newHfv()]);setShos([newSho()]);setDcms([newDcm()]);setPqs([newPq()]);
        setEmis([newEmi()]);setAbs([newAb()]);setSbs([newSb()]);
        setInst({on:false,items:{}});setOt({on:false,rows:[]});setCustom({on:false,rows:[]});
        setBudget({on:false,rows:[],markup:"25"});setSub({on:false,rows:[]});
        setTd("0");setSetup({techRate:"175",fabHours:"4",holes:"0",cables:"0",drillTap:false});
        setGlobalPR({procs:[],reps:[],coc:false,cocPrice:"250"});
        setNotes("");setLineOverrides({});setLineOrder(null);setPickerLines([]);userEditedSpecs.current=false;userEditedNotes.current=false;
        setModalAnalysis({on:false,price:"6750"});setFixtureDrawing({on:false,price:"2950"});setInStockModal({on:false,targetProc:""});
        setWonInfo({wonDate:"",jobNum:"",poNum:""});setWonLocked(false);
        setApproval({status:"none",submittedBy:"",submittedAt:"",decidedBy:"",decidedAt:"",comments:"",history:[]});
        setChatterEntries([]);setChatterInput("");
        setLocked(false);setCurrentQuoteId(null);setCurrentQuoteSource("vibrato");
        setOpenQuotesPanel(false);
        navigateTo(false);
        window.scrollTo({top:0,behavior:"smooth"});
      }
    }
  };
  // Multi-instance helpers
  const mkUpdater=(_arr,setArr)=>(idx,val)=>setArr(prev=>prev.map((x,i)=>i===idx?(typeof val==="function"?val(x):val):x));
  // New instances inherit settings from the first active instance (same chamber, level, etc.)
  // but get a fresh id, on:false, identifier:"", and reset custom rows
  const mkAdder=(_arr,setArr,newFn)=>()=>setArr(prev=>{
    const base=newFn();
    const firstOn=prev.find(i=>i.on);
    const inherit=firstOn?{
      ...base,           // start from fresh defaults
      // only copy pricing fields from firstOn, not UI/structural fields
      stdSetup: firstOn.stdSetup||base.stdSetup,
      testing:  firstOn.testing||base.testing,
      addlCosts:firstOn.addlCosts||base.addlCosts,
      id:Date.now(),
      on:false,
      identifier:"",
      customRows:[],
      proc:false,
      report:false,
    }:{...base,id:Date.now(),identifier:""};
    return [...prev,inherit];
  });
  const mkRemover=(_arr,setArr)=>idx=>setArr(prev=>prev.filter((_,i)=>i!==idx));

  const vibSetup=vibs.find(v=>v.on)?sf(vibs.find(v=>v.on).setup):0;

  const summary=useMemo(()=>calcSummary(vibs,shocks,noises,envs,hfvs,shos,emis,pqs,dcms,abs,sbs,inst,ot,custom,td,coc,sub,globalPR,budget,setup,splitProcReport,modalAnalysis,fixtureDrawing,inStockModal),
    [vibs,shocks,noises,envs,hfvs,shos,emis,pqs,dcms,abs,sbs,inst,ot,custom,td,coc,sub,globalPR,budget,setup,splitProcReport,modalAnalysis,fixtureDrawing,inStockModal]);

  // When summary length changes: reset lineOrder and remap deleted overrides by label
  useEffect(()=>{
    if(!isDirty)return; // never remap when not in edit mode — protects locked/submitted quotes
    if(lineOrder&&lineOrder.length!==summary.lines.length){
      const oldLen=lineOrder.length;
      const newLen=summary.lines.length;
      if(newLen>oldLen){
        // Lines were added — append new indices at end, preserving existing order
        const newIndices=[];
        for(let i=oldLen;i<newLen;i++)newIndices.push(i);
        setLineOrder([...lineOrder,...newIndices]);
      } else {
        // Lines were removed — rebuild order by keeping only valid indices
        // Map old positions to new positions using label matching
        const oldLabels=lineOrder.map(i=>summary.lines[i]?.label).filter(Boolean);
        const newLabelToIdx={};
        summary.lines.forEach((l,i)=>{newLabelToIdx[l.label]=i;});
        const rebuilt=oldLabels
          .map(lbl=>newLabelToIdx[lbl])
          .filter(i=>i!==undefined);
        // Add any new indices not already in rebuilt
        const usedIdxs=new Set(rebuilt);
        for(let i=0;i<newLen;i++){if(!usedIdxs.has(i))rebuilt.push(i);}
        setLineOrder(rebuilt.length===newLen?rebuilt:null);
      }
    }
    // Remap only deleted flags — use stored label to find correct new index
    // Price/desc overrides are left alone (harmless if slightly off)
    const hasDeleted=Object.values(lineOverrides).some(ov=>ov?.deleted&&ov?.label);
    if(!hasDeleted)return;
    const labelToNewIdx={};
    summary.lines.forEach((l,i)=>{labelToNewIdx[l.label]=i;});
    let changed=false;
    const next={...lineOverrides};
    // Remove ALL deleted entries first (labeled and unlabeled)
    Object.entries(next).forEach(([k,ov])=>{
      if(ov?.deleted){ delete next[k]; changed=true; }
    });
    // Re-insert labeled deletions at correct new positions
    Object.entries(lineOverrides).forEach(([,ov])=>{
      if(ov?.deleted&&ov?.label){
        const newIdx=labelToNewIdx[ov.label];
        if(newIdx!==undefined){next[newIdx]=ov; changed=true;}
        // else line no longer exists — drop silently
      }
      // Unlabeled deletions are dropped permanently
    });
    if(changed)setLineOverrides(next);
  },[summary.lines.map(l=>l.label).join('|')]);

  // Reset td override when no main tests are active
  useEffect(()=>{
    if(!isDirty)return; // don't reset td when not in edit mode
    const anyActive=vibs.some(s=>s.on)||shocks.some(s=>s.on)||noises.some(s=>s.on)||
      envs.some(s=>s.on)||hfvs.some(s=>s.on)||shos.some(s=>s.on)||
      abs.some(s=>s.on)||sbs.some(s=>s.on);
    if(!anyActive&&sf(td)>0)setTd("0");
  },[vibs,shocks,noises,envs,hfvs,shos,abs,sbs,hfvs,shos]);

  const autoSpecs=useMemo(()=>buildSpecs(vibs,shocks,noises,envs,hfvs,shos,dcms,emis,pqs,abs,sbs),
    [vibs,shocks,noises,envs,hfvs,shos,dcms,emis,pqs,abs,sbs]);

  const autoNotes=useMemo(()=>{
    const lines=[];
    if(noises.some(s=>s.on))lines.push("Frequencies below 100Hz to be performed as a best effort. All cabling that connects to the unit should be a minimum of 20 feet unless otherwise discussed.");
    if(noises.some(s=>s.on&&s.level==="170dB"))lines.push("OASPLs greater than 170dB will be performed as a best effort.");
    if(noises.some(s=>s.on&&(()=>{
      const hrs=s.durUnit==="hours"?Math.ceil(parseFloat(s.durVal)||0):Math.ceil((parseFloat(s.durVal)||0)/60);
      return hrs>8;
    })()))lines.push("Testing will be performed during normal business hours unless otherwise discussed, and it is assumed to be acceptable for this test to be stopped and restarted.");
    if(pqs.some(s=>s.on&&s.cw))lines.push("Current Waveform testing performed using facility power.");
    if(emis.some(s=>s.on)){
      lines.push("EMI Notes:\n"+
        "* This quote assumes that the susceptibility criteria can be determined in less than 3 seconds during real-time operation of the EUT, and that if additional monitoring personnel are needed, they would be provided by the customer. Customer to supply cables and all peripheral and monitoring equipment, and one mode of operation (operating or standby). Susceptibility determination provided by the customer. Pricing is based on customer-supplied information, the assumptions listed here, and acceptance of an approved test procedure.\n"+
        "* Pricing and feasibility may be reevaluated upon completion and review of the NU Laboratories Test Configuration Form.\n"+
        "* This quote assumes that the number of cables and outside diameter of the cables under test are within NU Laboratories capabilities/limitations.\n"+
        "* Pricing assumes the standard list of tests from MIL-STD-461G, and that all testing is performed at NU Labs. Any tests requiring subcontracting will incur additional charges."
      );
    }
    if(inStockModal?.on)lines.push("The test procedure will include an in-stock modal analysis of the proposed test fixture. Any additional analysis or alterations to the proposed test setup or fixture may incur additional charges.");
    if(modalAnalysis?.on)lines.push("The modal analysis reflects the initial run of the analysis. Additional runs may incur additional charges.");
    if(fixtureDrawing?.on)lines.push("Test fixture drawings represent the initial design. Alterations to the design of the proposed test fixture may incur additional charges. These changes also may affect the price of test fixture fabrication.");
    lines.push("Refer to the notes section at the bottom of this quote for additional details.");
    return lines.join("\n\n");
  },[noises,pqs,emis,abs,sbs,modalAnalysis,fixtureDrawing,inStockModal]);

  // ── Track isDirty when test selections change ──────────────────────────────
  // Only test selection changes mark the quote dirty (not metadata like account name)
  // isDirty=true means live calcSummary should be used; false means use snapshot
  useEffect(()=>{
    if(isLoadingRef.current)return; // suppress during load
    if(locked)return; // never mark dirty when quote is locked
    setIsDirty(true);
  },[vibs,shocks,noises,envs,hfvs,shos,emis,pqs,dcms,abs,sbs,inst,ot,custom,
     budget,globalPR,lineOverrides,splitProcReport,modalAnalysis,fixtureDrawing,inStockModal]);

  // Sync auto-generated specs into tiSpecs when tests change
  // Stores what was actually inserted so it can always be removed cleanly
  const prevAutoSpecs=useRef("");
  const insertedAutoSpecs=useRef(""); // tracks what we actually put into tiSpecs
  const userEditedSpecs=useRef(false); // true once user manually edits tiSpecs
  useEffect(()=>{
    const prev=prevAutoSpecs.current;
    prevAutoSpecs.current=autoSpecs;
    if(prev===autoSpecs)return;
    if(!isDirty)return; // never overwrite specs when not in edit mode
    if(userEditedSpecs.current)return; // user has manually edited specs — don't auto-update
    setTi(t=>{
      const cur=t.tiSpecs||"";
      const inserted=insertedAutoSpecs.current;
      let manual=cur;
      // Remove whatever we last inserted — try all possible positions
      if(inserted){
        if(manual.endsWith("\n\n"+inserted))manual=manual.slice(0,-(inserted.length+2)).trimEnd();
        else if(manual===inserted)manual="";
        else if(manual.includes("\n\n"+inserted))manual=manual.replace("\n\n"+inserted,"").trimEnd();
        else if(manual.includes(inserted+"\n\n"))manual=manual.replace(inserted+"\n\n","").trimEnd();
        else if(manual.includes(inserted))manual=manual.replace(inserted,"").trim();
        else if(inserted&&cur.length>0){
          // Format mismatch — inserted text not found verbatim in tiSpecs
          // Auto-text is always appended at the end — try to strip any trailing
          // auto-generated sentences by finding where manual text ends
          // Heuristic: split by double newline, keep lines that don't start with
          // known auto-text beginnings
          const AUTO_STARTS=["Vibration testing","Shock testing","Drop Shock","Bench Handling",
            "Noise testing","EMI testing","Power Quality","DC Magnetics","Airborne Noise",
            "Structureborne Noise","Temperature","Humidity","Altitude","Salt Fog","ESS",
            "Acceleration","Inclination","Rapid Decompression","Explosive Decompression",
            "Drip Test","Submergence","Spray Test","Insulation Resistance",
            "High Frequency","MIL-STD","Test procedure","Frequencies below","OASPLs",
            "Current Waveform","The modal","Test fixture","The test procedure","The drawings"];
          const parts=cur.split("\n\n");
          const manualParts=parts.filter(p=>!AUTO_STARTS.some(s=>p.trim().startsWith(s)));
          manual=manualParts.join("\n\n").trim();
        }
      }
      if(!autoSpecs){insertedAutoSpecs.current="";return {...t,tiSpecs:manual};}
      insertedAutoSpecs.current=autoSpecs;
      if(!manual)return {...t,tiSpecs:autoSpecs};
      return {...t,tiSpecs:manual+"\n\n"+autoSpecs};
    });
  },[autoSpecs]);

  const prevAutoNotes=useRef("");
  const insertedAutoNotes=useRef("");
  const userEditedNotes=useRef(false);
  useEffect(()=>{
    const prev=prevAutoNotes.current;
    prevAutoNotes.current=autoNotes;
    if(prev===autoNotes)return;
    if(!isDirty)return; // never overwrite notes when not in edit mode
    if(userEditedNotes.current)return; // user has manually edited notes — don't auto-update
    setTi(t=>{
      const cur=t.tiNotes||"";
      const inserted=insertedAutoNotes.current;
      let manual=cur;
      if(inserted){
        if(manual.endsWith("\n\n"+inserted))manual=manual.slice(0,-(inserted.length+2)).trimEnd();
        else if(manual===inserted)manual="";
        else if(manual.includes("\n\n"+inserted))manual=manual.replace("\n\n"+inserted,"").trimEnd();
        else if(manual.includes(inserted+"\n\n"))manual=manual.replace(inserted+"\n\n","").trimEnd();
        else if(manual.includes(inserted))manual=manual.replace(inserted,"").trim();
      }
      if(!autoNotes){insertedAutoNotes.current="";return {...t,tiNotes:manual};}
      insertedAutoNotes.current=autoNotes;
      if(!manual)return {...t,tiNotes:autoNotes};
      return {...t,tiNotes:manual+"\n\n"+autoNotes};
    });
  },[autoNotes]);

  const anyOn=vibs.some(s=>s.on)||shocks.some(s=>s.on)||noises.some(s=>s.on)||envs.some(s=>s.on)||
    hfvs.some(s=>s.on)||shos.some(s=>s.on)||dcms.some(s=>s.on)||pqs.some(s=>s.on)||emis.some(s=>s.on)||
    abs.some(s=>s.on)||sbs.some(s=>s.on)||inst.on||ot.on||custom.on||globalPR.coc||globalPR.procs.length>0||globalPR.reps.length>0;

  // Nav/display total respects lineOverrides (price edits + deleted lines), matching PDF behaviour
  // Use snapshot total when not dirty — immune to formula changes
  // Use live calcSummary when dirty (user is actively editing test selections)
  const liveTotal=useMemo(()=>{
    const baseTotal=summary.lines.reduce((a,l,idx)=>{
      const ov=lineOverrides[idx]||{};
      if(ov.deleted)return a;
      return a+(ov.price!==undefined?sf(ov.price,0):l.val);
    },0);
    const pickerTotal=(pickerLines||[]).reduce((a,l)=>a+(l.price||0),0);
    return baseTotal+pickerTotal;
  },[summary.lines,lineOverrides,pickerLines]);
  const displayTotal=(!isDirty&&snapshot!=null) ? (snapshot.total??liveTotal) : liveTotal;

  // Clone quote — optionally save original first, then open modal for new opp #
  const handleFlag = async () => {
    if(flagLoading)return;
    setFlagLoading(true);
    try {
      // Ensure quote is saved to Supabase before flagging
      // This handles SF-imported quotes that may not have a valid row yet
      let qid = currentQuoteId;
      if(!qid){
        const q={id:undefined,opp:qi.opp,customer:qi.account,rfq:qi.rfq,total:displayTotal,
          qi,ti,vibs,shocks,noises,envs,hfvs,shos,dcms,pqs,emis,abs,sbs,inst,ot,custom,
          budget,coc,sub,td,setup,globalPR,notes,splitProcReport,modalAnalysis,fixtureDrawing,
          inStockModal,wonInfo,approval,wonApproval,chatterEntries,summary,lineOrder,lineOverrides,pickerLines,unifiedOrder};
        const newId=await saveQuoteToSupabase(q,autoSpecs,autoNotes);
        if(!newId){showToast("Save failed before flagging","error");setFlagLoading(false);return;}
        setCurrentQuoteId(newId);
        qid=newId;
      }
      if(quoteFlag){
        await supabase.from("quote_flags").update({resolved:true,resolved_by:currentUser,resolved_at:new Date().toISOString()}).eq("id",quoteFlag.id);
        setQuoteFlag(null);
        setFlagNote("");
        showToast("🚩 Flag removed","info");
      } else {
        // Verify currentQuoteId is the right quote before inserting
        // Re-fetch to confirm it matches qi.opp
        const {data:check}=await supabase.from("quotes").select("id,opportunity").eq("id",qid).single();
        const confirmedId=check?.opportunity===qi.opp ? qid : null;
        if(!confirmedId){showToast("Flag error: quote ID mismatch, try again","error");setFlagLoading(false);setShowFlagPopover(false);return;}
        const {data,error}=await supabase.from("quote_flags").insert({
          quote_id:confirmedId,
          opportunity:qi.opp,
          customer:qi.account,
          flagged_by:currentUser,
          note:flagNote.trim()||null,
        }).select().single();
        if(!error&&data){setQuoteFlag(data);showToast("🚩 Quote flagged","success");setDashboardNeedsRefresh(true);}
        else showToast("Flag failed","error");
      }
    } catch(e){ showToast("Flag error: "+e.message,"error"); }
    setShowFlagPopover(false);
    setFlagLoading(false);
  };

  const sortPickerLines = (lines) => {
    const order = l => {
      const code = l.code||"";
      const label = (l.label||"").toLowerCase();
      if(code==="42"||code==="44"||label.includes("procedure")) return 0;
      if(code==="96"||label.includes("tear down")||label.includes("teardown")) return 8;
      if(code==="41"||code==="43"||label.includes("report")||label.includes("certificate")) return 9;
      return 5;
    };
    return [...lines].sort((a,b)=>order(a)-order(b));
  };

  const handleProductPickerAdd = (lines) => {
    const newLines = lines.map(l => ({
      id: Date.now()+Math.random(),
      label: l.label,
      code: l.code||"94",
      price: l.price||0,
      desc: l.desc||"",
    }));
    setPickerLines(prev => sortPickerLines([...prev, ...newLines]));
    // Preserve existing sort order — append new lines to END of unifiedOrder
    setUnifiedOrder(prev => {
      if(!prev) return null; // no existing order, stay null (default append)
      // Append new picker entries at the end of existing unified order
      const newEntries = newLines.map(l => ({type:'picker', id: l.id||l.label, label: l.label}));
      return [...prev, ...newEntries];
    });
    setIsDirty(true);
    showToast(`Added ${lines.length} line item${lines.length!==1?"s":""} to quote`, "success");
  };

  const handleClone=()=>{
    const result=window.confirm("Save the current quote before cloning?\n\nClick OK to save first, or Cancel to clone without saving.");
    if(result){
      const q={id:currentQuoteId||undefined,opp:qi.opp,customer:qi.account,rfq:qi.rfq,total:displayTotal,
        qi,ti,vibs,shocks,noises,envs,hfvs,shos,dcms,pqs,emis,abs,sbs,inst,ot,custom,budget,coc,sub,td,setup,globalPR,notes,splitProcReport,modalAnalysis,fixtureDrawing,inStockModal,wonInfo,approval,wonApproval,chatterEntries,summary,lineOrder,lineOverrides,pickerLines,unifiedOrder};
      saveQuoteToSupabase(q,autoSpecs,autoNotes);
    }
    setCloneOppInput("");
    setShowCloneModal(true);
  };

  const doClone=(newOpp)=>{
    setQi(q=>({...q,opp:newOpp,rfq:"",rev:"",revDate:"",date:new Date().toLocaleDateString("en-US"),stage:"Proposal/Price Quote"}));
    setWonInfo({wonDate:"",jobNum:"",poNum:""});
    setWonLocked(false);
    setCurrentQuoteId(null);
    setLineOrder(null);
    setLineOverrides({});
    setCurrentQuoteSource("vibrato");
    setLocked(false);
    setChatterEntries([]);setChatterInput("");
    setWonApproval({status:"none",submittedBy:"",submittedAt:"",decidedBy:"",decidedAt:"",comments:""});
    setApproval({status:"none",submittedBy:"",submittedAt:"",decidedBy:"",decidedAt:"",comments:"",history:[]});
    setShowCloneModal(false);
    setCloneOppInput("");
    window.scrollTo({top:0,behavior:"smooth"});
  };

  const handleNewQuote=(skipConfirm=false)=>{
    isLoadingRef.current=true; // suppress isDirty during reset
    if(!skipConfirm){
      const result=window.confirm("Save the current quote before starting a new one?\n\nClick OK to save, or Cancel to discard and continue.");
      if(result){
        const id=currentQuoteId||undefined;
        const q={id,opp:qi.opp,customer:qi.account,rfq:qi.rfq,total:displayTotal,
          qi,ti,vibs,shocks,noises,envs,hfvs,shos,dcms,pqs,emis,abs,sbs,inst,ot,custom,budget,coc,sub,td,setup,globalPR,notes,splitProcReport,modalAnalysis,fixtureDrawing,inStockModal,wonInfo,approval,wonApproval,chatterEntries,summary,lineOrder,lineOverrides,pickerLines,unifiedOrder};
        saveQuoteToSupabase(q,autoSpecs,autoNotes);
      }
    }
    // Reset all state to blank defaults
    setQi({opp:"",account:"",billTo:"",billToCity:"",contact:"",email:"",prepby:"",rev:"",revDate:"",date:new Date().toLocaleDateString("en-US"),rfq:"",stage:"Proposal/Price Quote",type:"New Business",relatedOpps:""});
    setTi({item:"",qty:"1",model:"",drawing:"",loads:null,dimL:"",dimW:"",dimH:"",wt:"",volt:"",pwrType:"AC",phase:"",hz:"",inrush:"",amps:"",mounting:"",pressureFlow:"",gsi:"Unknown",witness:"Unknown",docRestriction:"None",dpas:"",tiSpecs:"",tiNotes:""});
    setVibs([newVib()]); setShocks([newShock()]); setNoises([newNoise()]); setEnvs([newEnv()]);
    setHfvs([newHfv()]); setShos([newSho()]); setDcms([newDcm()]); setPqs([newPq()]);
    setEmis([newEmi()]); setAbs([newAb()]); setSbs([newSb()]);
    setInst({on:false,items:{}}); setOt({on:false,rows:[]}); setCustom({on:false,rows:[]});
    setBudget({on:false,rows:[],markup:"25"}); setSub({on:false,rows:[]});
    setTd("0"); setSetup({techRate:"175",fabHours:"4",holes:"0",cables:"0",drillTap:false});
    setGlobalPR({procs:[],reps:[],coc:false,cocPrice:"250"});
    setNotes(""); setLineOverrides({}); setLineOrder(null); setPickerLines([]); setUnifiedOrder(null);
    setModalAnalysis({on:false,price:"6750"}); setFixtureDrawing({on:false,price:"2950"}); setInStockModal({on:false,targetProc:""});
    setWonInfo({wonDate:"",jobNum:"",poNum:""}); setWonLocked(false);
    setApproval({status:"none",submittedBy:"",submittedAt:"",decidedBy:"",decidedAt:"",comments:"",history:[]});
    setLocked(false); setCurrentQuoteId(null); setCurrentQuoteSource("vibrato");
    setWonApproval({status:"none",submittedBy:"",submittedAt:"",decidedBy:"",decidedAt:"",comments:""});
    setChatterEntries([]);setChatterInput("");setQuoteSentAt(null);setShowFollowUpPopover(false);setFollowUpDate("");setSnapshot(null);setIsDirty(true); // new quote — no snapshot yet, all live
    setTimeout(()=>{ isLoadingRef.current=false; }, 50);
    localStorage.removeItem("vibrato_last_quote_id");
    window.scrollTo({top:0,behavior:"smooth"});
  };

  // Save quote to Supabase
  const handleSave=async()=>{
    recentSaveRef.current=Date.now();
    // Build price snapshot — frozen at save time, immune to future formula changes
    const snapshotLines=(summary.lines||[]).map((l,i)=>{
      const ov=lineOverrides[i]||{};
      if(ov.deleted)return null;
      return {...l, val: ov.price!==undefined ? sf(ov.price,0) : l.val};
    }).filter(Boolean);
    const savedSnapshot={
      lines: snapshotLines,
      total: displayTotal,
      tiSpecs: ti.tiSpecs||"",
      tiNotes: ti.tiNotes||"",
      savedAt: new Date().toISOString(),
    };
    const q={id:currentQuoteId||undefined,opp:qi.opp,customer:qi.account,rfq:qi.rfq,total:displayTotal,
      qi,ti,vibs,shocks,noises,envs,hfvs,shos,dcms,pqs,emis,abs,sbs,inst,ot,custom,budget,coc,sub,td,setup,globalPR,notes,splitProcReport,modalAnalysis,fixtureDrawing,inStockModal,wonInfo,approval,wonApproval,chatterEntries,summary,lineOrder,lineOverrides,pickerLines,unifiedOrder,snapshot:savedSnapshot};
    const newId=await saveQuoteToSupabase(q,autoSpecs,autoNotes);
    if(newId){
      setCurrentQuoteId(newId);
      setSnapshot(savedSnapshot);
      setIsDirty(false); // quote is now clean — snapshot is current
      showToast("Saved — "+(qi.opp||"Untitled"),"success");
      // Update savedQuotes so approval queue reflects new total immediately
      setSavedQuotes(prev=>({
        ...prev,
        [newId]:{...(prev[newId]||{}), ...q, id:newId, total:displayTotal}
      }));
    } else {
      showToast("Save failed — check your connection and try again.","error",5000);
    }
  };

  // Delete current quote from Supabase
  const handleDeleteQuote=async()=>{
    if(!currentQuoteId){alert("This quote hasn't been saved yet — nothing to delete.");return;}
    const confirmed=window.confirm("Are you sure you want to delete this quote? You cannot retrieve it once deleted.");
    if(!confirmed)return;
    await deleteQuoteFromSupabase(currentQuoteId);
    setCurrentQuoteId(null);
    localStorage.removeItem("vibrato_last_quote_id");
    alert("Quote deleted.");
  };

  // Load quote from search
  const handleLoad=q=>{
    isLoadingRef.current=true; // suppress isDirty during load
    // Pre-seed prevAutoSpecs/prevAutoNotes so the sync useEffect doesn't re-append
    // on load (the saved tiSpecs already contains the auto-generated text)
    const loadedAutoSpecs=buildSpecs(
      q.vibs||[newVib()], q.shocks||[newShock()], q.noises||[newNoise()],
      q.envs||[newEnv()], q.hfvs||[newHfv()], q.shos||[newSho()],
      q.dcms||[newDcm()], q.emis||[newEmi()], q.pqs||[newPq()],
      q.abs||[newAb()], q.sbs||[newSb()]
    );
    prevAutoSpecs.current=loadedAutoSpecs;
    insertedAutoSpecs.current=loadedAutoSpecs;
    userEditedSpecs.current=false; // reset on load
    // Pre-seed autoNotes the same way — compute from loaded tests so the
    // guard fires correctly and doesn't re-append on load
    const loadedAutoNotes=(()=>{
      const lines=[];
      const n=q.noises||[newNoise()];
      const p=q.pqs||[newPq()];
      const e=q.emis||[newEmi()];
      const im=q.inStockModal||{on:false};
      const ma=q.modalAnalysis||{on:false};
      const fd=q.fixtureDrawing||{on:false};
      if(n.some(s=>s.on))lines.push("Frequencies below 100Hz to be performed as a best effort. All cabling that connects to the unit should be a minimum of 20 feet unless otherwise discussed.");
      if(n.some(s=>s.on&&s.level==="170dB"))lines.push("OASPLs greater than 170dB will be performed as a best effort.");
      if(p.some(s=>s.on&&s.cw))lines.push("Current Waveform testing performed using facility power.");
      if(e.some(s=>s.on))lines.push("EMI Notes:\n* This quote assumes that the susceptibility criteria can be determined in less than 3 seconds during real-time operation of the EUT, and that if additional monitoring personnel are needed, they would be provided by the customer. Customer to supply cables and all peripheral and monitoring equipment, and one mode of operation (operating or standby). Susceptibility determination provided by the customer. Pricing is based on customer-supplied information, the assumptions listed here, and acceptance of an approved test procedure.\n* Pricing and feasibility may be reevaluated upon completion and review of the NU Laboratories Test Configuration Form.\n* This quote assumes that the number of cables and outside diameter of the cables under test are within NU Laboratories capabilities/limitations.\n* Pricing assumes the standard list of tests from MIL-STD-461G, and that all testing is performed at NU Labs. Any tests requiring subcontracting will incur additional charges.");
      if(im?.on)lines.push("The test procedure will include an in-stock modal analysis of the proposed test fixture. Any additional analysis or alterations to the proposed test setup or fixture may incur additional charges.");
      if(ma?.on)lines.push("The modal analysis reflects the initial run of the analysis. Additional runs may incur additional charges.");
      if(fd?.on)lines.push("Test fixture drawings represent the initial design. Alterations to the design of the proposed test fixture may incur additional charges. These changes also may affect the price of test fixture fabrication.");
      lines.push("Refer to the notes section at the bottom of this quote for additional details.");
      return lines.join("\n\n");
    })();
    prevAutoNotes.current=loadedAutoNotes;
    insertedAutoNotes.current=loadedAutoNotes;
    userEditedNotes.current=false; // reset on load
    if(q.qi)setQi(q.qi);
    if(q.ti)setTi(q.ti);
    if(q.vibs)setVibs(q.vibs);
    if(q.shocks)setShocks(q.shocks);
    if(q.noises){
      // Recalculate noise testing prices on load in case compBudget was saved as "0"
      // but the level requires a compressor (saved before compressor logic existed)
      const COMP_COST_LOAD={"<=140dB":0,"145dB":750,"150dB":1500,"155dB":1500,"160dB":1500,"165dB":2000,"170dB":3500};
      const fixedNoises=q.noises.map(n=>{
        if(!n.on)return n;
        const ac=COMP_COST_LOAD[n.level]||0;
        if(ac>0&&(n.compBudget==="0"||!n.compBudget)){
          return {...n, compBudget:String(ac),
            testing:String(noiseTestingPrice(n.durVal,n.durUnit,n.level,ac))};
        }
        return n;
      });
      setNoises(fixedNoises);
    }
    if(q.envs)setEnvs(q.envs);
    if(q.hfvs)setHfvs(q.hfvs);
    if(q.shos)setShos(q.shos);
    if(q.dcms)setDcms(q.dcms);
    if(q.pqs)setPqs(q.pqs);
    if(q.emis)setEmis(q.emis);
    if(q.abs)setAbs(q.abs);
    if(q.sbs)setSbs(q.sbs);
    if(q.globalPR)setGlobalPR(q.globalPR);
    if(q.splitProcReport!==undefined)setSplitProcReport(q.splitProcReport);
    if(q.modalAnalysis)setModalAnalysis(q.modalAnalysis); else setModalAnalysis({on:false,price:"6750"});
    if(q.fixtureDrawing)setFixtureDrawing(q.fixtureDrawing); else setFixtureDrawing({on:false,price:"2950"});
    if(q.inStockModal)setInStockModal(q.inStockModal); else setInStockModal({on:false,targetProc:""});
    if(q.notes)setNotes(q.notes);
    if(q.inst)setInst(q.inst);
    if(q.ot)setOt(q.ot);
    if(q.custom)setCustom(q.custom);
    if(q.budget)setBudget(q.budget);
    // coc now in globalPR
    if(q.sub)setSub(q.sub);
    if(q.td)setTd(q.td);
    if(q.setup)setSetup(q.setup);
    if(q.approval)setApproval(q.approval); else setApproval({status:"none",submittedBy:"",submittedAt:"",decidedBy:"",decidedAt:"",comments:"",history:[]});
    if(q.wonApproval)setWonApproval(q.wonApproval); else setWonApproval({status:"none",submittedBy:"",submittedAt:"",decidedBy:"",decidedAt:"",comments:""});
    if(q.wonInfo)setWonInfo(q.wonInfo); else setWonInfo({wonDate:"",jobNum:"",poNum:""});
    setChatterEntries(q.chatterEntries||[]);
    if(q.lineOrder!==undefined)setLineOrder(q.lineOrder); else setLineOrder(null);
    {const wd=q.wonInfo?.wonDate||"";const validDate=wd&&!isNaN(new Date(wd))&&!/^\d+$/.test(wd.trim());setWonLocked(!!(validDate||q.wonInfo?.jobNum?.trim()||q.wonInfo?.poNum?.trim()));}
    setCurrentQuoteId(q.id||null);
    if(q.id){localStorage.setItem("vibrato_last_quote_id",String(q.id));}
    setCurrentQuoteSource(q.source||"vibrato");
    if(q.source==="salesforce")setLocked(true);
    // Load snapshot and clear dirty flag
    setSnapshot(q.snapshot||null);
    setIsDirty(false);
    // Validate lineOverrides on load:
    // - Deleted flags: keep only if the stored label exists somewhere in the saved summary
    //   (not necessarily at the same index — indices shift when tests change)
    // - Price/desc overrides: keep as-is
    setPickerLines(q.pickerLines||[]); setUnifiedOrder(q.unifiedOrder||null);
    if(q.lineOverrides!==undefined){
      const savedLines=q.summary?.lines||[];
      // Build a set of all labels in the saved summary for O(1) lookup
      const savedLabelSet=new Set(savedLines.map(l=>l.label));
      // Also build a label->index map so we can remap to the correct current index
      const savedLabelToIdx={};
      savedLines.forEach((l,i)=>{ savedLabelToIdx[l.label]=i; });
      const validated={};
      Object.entries(q.lineOverrides).forEach(([k,ov])=>{
        if(ov?.deleted){
          const storedLabel=ov.label;
          // Drop deletions with no stored label — can't verify
          if(!storedLabel) return;
          // Keep deletion if the label exists in saved summary — remap to correct index
          if(savedLabelSet.has(storedLabel)){
            const correctIdx=savedLabelToIdx[storedLabel];
            validated[String(correctIdx)]={...ov};
          }
          // else: label no longer exists in summary — drop silently
        } else {
          validated[k]=ov; // keep price/desc overrides as-is
        }
      });
      setLineOverrides(validated);
    } else {
      setLineOverrides({});
    }
    // Release loading lock after React has batched all state updates
    setTimeout(()=>{ isLoadingRef.current=false; }, 50);
    // ── Salesforce imported quotes: load line items into custom section ──
    // Only populate from SF data if the user hasn't already saved custom rows
    if(q.source==="salesforce"&&!(q.custom?.rows?.length>0)){
      const sfLines=(q.summary?.lines||[]).filter(l=>l.val>0);
      if(sfLines.length>0){
        setCustom({on:true,rows:sfLines.map(l=>({
          label:l.label||"Line Item",
          price:String(Math.round(l.val)),
          pcode:l.code||"",
        }))});
      }
      // wonInfo is already loaded from the blob at line 4165 above — no need to re-apply here
    }
  };
  // Keep ref pointing at latest handleLoad so realtime toast button can call it
  reloadOpenQuoteRef.current=(id)=>{
    supabase.from("quotes")
      .select("id, opportunity, customer, rfq, revision, stage, total, approval_status, won_approval_status, updated_at, data, source")
      .eq("id",id).single()
      .then(({data:row,error})=>{
        if(error||!row)return;
        const q=row.data||{};
        handleLoad({...q,id:row.id,opp:row.opportunity||q.opp,
          customer:row.customer||q.customer,rfq:row.rfq||q.rfq,
          total:row.total??q.total,savedAt:row.updated_at,
          source:row.source||"vibrato",
          approval:{...(q.approval||{}),status:row.approval_status||q.approval?.status||"none"},
          wonApproval:{...(q.wonApproval||{}),status:row.won_approval_status||q.wonApproval?.status||"none"},
        });
        showToast("Quote reloaded ✓","success");
      });
  };

  const setupProps={setup};

  // ── PDF Logo (dark text, transparent bg for white PDF background) ──
  const NU_LOGO_PDF = "data:image/png;base64,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";

  
  const JORDAN_SIG_PDF = "data:image/png;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCAQABgADASIAAhEBAxEB/8QAHQABAAICAwEBAAAAAAAAAAAAAAcIBgkBBAUDAv/EAE4QAAIBAwMCBAMEBwUFBgUCBwABAgMEBQYHERIhCDFBURMiYRQyQnEJI1JicoGRFRYzgqEXJEOSoiVTY3ODsTQ1o7KzwVSTGETC0dLh/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/ALlAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPM1Dn8Hp2wd/n8xj8Var/jXlxCjDn2Tk1y/oQlrfxbbT4CVSji7nI6juI9krC36aXPs6lTpXH1ipAWABRvVHja1NXnKOmtG4qwh5Kd9XqXEvz4j0Jf6mB3vik3xy1Vxsc1QtXzz0WWLpS4/5oyYGyAGtifiS39xlaE77U9xFc8qFzibeKl/9JP/AFM30T40taY+pClqvTuKzVDydS1crWt+f4oP8ulAXwBGGzW+egd0oK3wmQlaZZR6p4y9Sp10l5uPdqovrFvj1SJPAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH4q1aVGKlVqQpxb4TlJJc+3cD9g4TTSaaafkzkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABwRLvJ4g9vNtPi2V7kHlc3BNLGWDU6kZe1SX3af8AN9XsmVD3E8Qm7W7OUentMUbvF2d03Cni8NGc7itH2nUiuuXbzS6Y8eaAuHurv7tpt1Kra5XNq/ylPs8djkq9dP2l3UYflKSf0Kt7l+MTXGec7HReMttNW0/ljXlxc3cvTs2uiPPsotr3OztZ4ONV5uNLIa+y1PT9tN9Ts7fivdyX7z56IP8AnJ+6LVbYbKbcbdRp1NP6doSv4L/5hefr7lv3U5fc/KCigKNac2V3z3ZySzGUssn01n3yWoLidNcP2U+ZuPt0xaJ20R4KdPW0YVtZasv8jV85UMdSjb00/brl1Skv5RLaACL9KeH/AGf02oux0Ni7mqv+Lfxd3Jv3/WuSX8kiRcdjcdjqKo4+wtbSnFJKFCjGmkl5LiKR2wB172ztL2i6N5bUbim1w4VaanF/yZDW8Hhp2511ja88di7bTOaabo32PoqEHL/xKS4jNP144l9SbQBqR1np3U22G4Nzhb+pUsMzibhSp3FtUcefKUKtOfZ8NcNPs/fh8ovx4Q97Hunpati87UpR1TiYR+1dKUVd0n2jXUfR89pJdk+H2UklFv6SPStL7PpjWtGklVU6mNuZpfeTTqUufy4q/wBSvHhn1hV0RvXpzMKq4WtW6jZ3i57OhWfRLn8uVL84oDaeDheRyAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADwtbaw0zorDyy+qc1Z4qzXZTrz4c3+zCK+acvpFNge6dTK5LH4mxqX+Uv7WxtKS5qV7mrGnTgvrKTSRT7dnxnS6q2P21wqS7x/tTJx/1hRT/AKOb/OJDOP0tvrv3kI5OtTzGat3J9N5fVPgWVP36OeIL8oJsC4Ws/FPs/p2pOjRzVzna8OU4Yu2dSPP/AJknGD/k2R1eeN7TcLhxs9C5etR5XE6t5Tpy49flSkv9TxtE+CWpKFOvrTWajL8dtiqHPH/q1P8A/QlfE+E3ZeytXRuMJkMjN/8AGucjVU//AKbiv9APP0j4v9qM1dxtckszp+UuEqt7bKdLn+KlKTX5tJE/Yy/sspj6GQxt3QvLO4gqlGvQqKdOpF+TjJdmigfi98PmL2wx9nqvSVzdTwt1c/Zbi1uZ9c7ao4uUHGfm4NRku/dNLu+e3d8B2697gNcU9vMpdVKmFzMmrKM5cq1uuG10+0ZpNNftdL9+QvwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABwB4+ttS4nR+lMjqXOXKt8fj6DrVZer48oxXrKT4il6tpGr3ePdHUu5WsbvO5a8r07eVR/Y7GNZulaU192MV5c8ecuOW+WS945N5KesNSx0Jp27+JgsPWbu61OXy3d2uU+H6wp90veTk+6UWVnpwnVqRpwi5Tk0oxS5bb9EBcP9HbrDVd/qDOaVvb29vcDbY9XNGNaTnC1q/EjFRi391STk+ldvk548y6REHhQ2tjththQtr6io57KON3lJesJNfJR59oRfH8Tk/Ul8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA+GQvLTH2Va+v7qha2tCDnVrVqihCnFeblJ9kvqypG/Pi+trKdfBbWU6d3WXMamauKfNKD/8ABpv77/el8v7sl3AsZuludovbXE/b9WZmlaynFuhaQ+e4uPpCmu779uXxFerRS3eLxQ673EunpzQlpeYDHXM/hU6do3O/u+eyTlHvHn9mHf0cmjxdrNktzd881PVWfv7q0xtzPqrZnJdVSpXXtRg2nNLyXlBccJ9uC6+zmy+hdrbNLT+N+NkpR6a2Tu+KlzU90pccQj+7FJe/L7gVT2b8IWqNRTpZfcS8qafsJvrdnTane1U+/wAzfMaXP16pe8UXJ25280bt7i/7P0lgrXHQkkqtaK6q1b6zqPmUv5vheiRlQAAAAAAAAAAACvP6QG1jcbBSqyk07bLWtWKXq31w7/ymzXjSlKnVjOLalF8pr0aNgv6Qu++zbGW1qqkYu8zNCm4tcuSjCpPt7d4o18xXMuF3bA3CaZu/t+nMZfKUZK4tKVXlPlPqgnz/AKnoni6EozttEYK3qRcZ0sbbwlFrhpqlFNHtAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHia11Xp3RmArZ3U+Wt8Zj6PaVWtL70vSMYrvKT9IpNshrE+LraC+y32Gtc5mwpNpRu7mwfwn3/clKSX1cQLAA+Nnc295aUbu0r069vXhGpSq05KUZxa5Uk15prvyfYAAAAAAAAAAAAAAAAAAAAAAAAAfO5r0ba3qXFzWp0aNKLnUqVJKMYRS5bbfZJe5g+8O7OjNrcOr3U2Q4uasW7XH0OJ3Nxx+zHnsv3pcJe/PYo7uXuzuh4gtSw0tp7H3dLG1pfqMLj5OSmk/v159urjt3lxCPbt6gTlvl4vsLg53GF23tqObv48wlk63P2Sm/3EuHVf17R8mupFe9M6I3l8ROpZZy6q3V9RcnCeVyMnStKC57wppLjt+xTj+fHmWE2L8IeEwsKGZ3KqUs1ke0o4ylJ/ZKL/ffZ1X9O0fNcS8y0tjaWthZ0rOxtqNrbUYqFKjRgoQhFeSjFdkvogIF2f8ACpt9otUchn6f968xDiXXeU0ranL9yj3T/Obl79if6VOFKnGnThGEIriMYrhJeyR+gAAAFef0gNxQo7ASpVX89fLW0KX8SU5P/pjIontZeVMfuZpi+o89dDL2lSPD454rQ7clqP0kmqIdGltG0ayc+auSuaafkv8ADpP/APL/AEK3eHzDyz29uj8YqfxIzy1CpOPvCnL4kv8ApgwNrYOF5HIAAAAeXqTUOC01jnkdQZiwxVonx8a7rxpRb9k5Pu/ojCcbvzs9kL77FbbgYZVnPoXxakqUW/pKaUX+fIElA/FGrTrUYVqNSFSnUipQnCXMZJ90015o/YAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAArl41t6XoPS39z9O3bhqXMUX11acuJWVs+U58+k5d4x9V80uzS5lHfPczDbWaDutRZNxrXL5pWFmpcSuq7XyxXtFecn6Je/Cer3WupcxrDVN/qTPXcrrI31V1a1R9l7KKXpFJJJeiSA8YsP4GNsv757mf3nydt8TC6cca7618ta6f+FD69PDm/4Yp/eIBxVheZXJ2uMx9vO4vLutChQpQXMqk5NKMV9W2jalsLt5abY7ZYzS9D4c7qEfj5CtDyrXM0uuX1S4UV+7FAZ2cgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADhtJNt8JAckdb2bxaO2oxCuM9duvka0G7TGW7Tr1/rx+CHPnKXbz45fYiDxEeK3FaZlcac26lb5fMxbp1slL57W1fr0elWa/5V+93RCWz+x+vt8szU1jqzKXdpibqp11srdpzr3fD44oxfml5dXaK8knxwB42v9yN1PERq2jp7GWVxK0qT6rXCWDfwaaT/AMStJ8dTXbmc+Ir0UeSx+xHhN03peNDNa+dDUOZXE42aTdlbv8n3qv6y+X931Jr2t220htrg/wCytKYuFsp8O4uZvrr3El61J+b9e3ZLnskZgB+acIUqcadOEYQilGMYrhJLySR+gAAAAAAAAAAAAAHAFPP0lOYccdo7AQn/AIta5vKkef2YwhB/9cynenrKpks9j8fSj1VLq6pUYr3cpqK/9ycvHtqRZvfivjadTqo4Sxo2fC8uuSdWf8/1iX+Uw3wq4L+8PiB0hZSh1U6N8ryfbtxQi6vf+cEv5gbRLanGjb06Mfuwior+S4PocLyOQAAAAAAAAAAAAAAAAAAAAAAAAAAAGJbr7g6d210fc6l1Hc/Do0/koUIcOrc1WvlpwXrJ8fkly3wkd/XurcFofSt7qXUd7G0sLSHVJ+cpy/DCC/FOT7JGs7f/AHazm7OsZ5W/c7bGW7lTxtgpcxt6b9X7zlwnKX5LySA6m9e6mp91dVTzGdrula0242OPpzbo2lN+kV6yfbqm+7fskksDj5pk17RbY21jt5lt5deWUZadxlJ/2Tj66aWVu2+mmpLs3RU2uePvcP0TPA8Negqu5W8WKw9SmnYUan27ItR+VUKck5R4Xl1Nxgv4gNh3h7xl5htkdHY6/wCpXNLE0HUjJcODlHq6X9UpJfyM8OIpRiklwl5L2OQAAAAAAAAAAAAAAAAAAAAHyuriha21W6uq1OhQowdSpVqSUYwily5Nvskl35YH1K5eJPxO4XQKudN6PdvmdULmFWpz1W1g/Xra+/UX7C7J/efbpcX+J7xTVsr9p0hthd1aFi+ad3mqfMalf0cKHrGP7/m/Thd28M/hVr5VW2rd0Larb2UuKtrhZNxqVl5qVf1hH9z7z9ePJhHW1e0W5PiA1PW1Xn8hc0sbXq/73m72Lk6nHboow7dXHkkuIR447ccF79p9stIbZYFYrS2NjRc0vtN3V4ncXMl61J+v0S4iueyRllhaWthZUbKxtqNtbUIKnSo0oKEKcUuFGKXZJeyPuAAAAAADiTUYuTaSS7t+hyQ34wdwf7g7M5GVpXVPK5jnHWPD+aLmn8Sov4YdXf0biBRDxG63/wBoG8Wf1DSqupY/H+zWPft9npfJBr+Lhy/OTJW/R46Vnld2MhqerR6rbCWElCfH3a9Z9Ef+hVSs3mzZJ4JNEvSGxthd3NLovs9N5Otyu6pzSVKPPt0JS/ObAnIAACBfEp4jsFthTq4HCRoZnVkof/D9XNGz5XaVZp88+qpru15uKa5xbxa+JGno/wC06I0JdU6uoWnC+v4cSjj/AHhD0db/AEh9ZeVW9kNodXbyamrfY5zo4+FXqyWXueZxhKXdrl96lR888c+vLaXcDxsrltxN5dcQ+01MlqTN3UmqNCnHmNOPtCC+WnBevkl5v3PH19pPO6G1VdaZ1HbwtsnaqDrU4Vo1EuuKkvmi2n2aNm2021+itotM1aGDtY05/C67/JXDTr11Fctzl6RXd9K4S/PlmtbeDVX999ztQapUZRp5G9nVoxl5xpL5aaf1UFEC4v6O3WeSzWhs5pTIXE69PBV6U7NzfLp0ayn+rX7qlBte3Vx5cFpipH6NnC1aGlNW6gqUkqd5e0LSlP1fwoSlL+X62JbcAAAAOCrHiR8VdhpqpcaY23qW2SzEOadxlGlUt7WXk1TXlVmvf7q/e7pBOe6G6Wh9trBXOrM5RtKs4uVG0gviXFb+Gmu/Hpy+F7srfqTxvWlO/cNO6Dq3FpGX+Lf3ypTmv4IRko/8zK0aX01uHvNratHH0r7PZa4kp3d5cVG4Uk/xVKj7RivRfThL0JT3q8OuG2l2elqLUGqa9/qS5u6NtZ21pSULZSfMpp9XM5pQjJ9Xy9+O3cCwOynis0lr/UVpprLYi605lr2ap2vXWVe3rVH5Q60ouMn6Jx4flzzwnYg0+aRd0tV4h2KqO7V9R+Aqf3uv4kenj688G4IDkAAAAAAAAAAAAAAAAAADztSZrGadwN7nMzeU7PH2NGVa4rVH2hFLv+b9El3baS7noMoD41t8FrXOS0Lpe869OY2t/vdelL5b64i/R+tOD8vRy5fdKLAjPxFbsZPdnXdTL1lUtsTadVHF2cn/AINLnvKXHbrnwnJ/kvKKI0Pb1bg5acrW+LvVKOWVJVb6i+32ZzScaTX7ajw5ezl0vhxZ8dHafyeq9U43TmHo/Gv8hcRoUY+nLfm/ZJctv0SYFk/0f22LzerbncXKUObDDSdDHqS7VLuUe8v/AE4P/mnFryL3GM7XaOxugdB4nSmLivgWFBQlU44dao+86j+spNv+fHoZMAAAAAAAAAAOOQOQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAw3dvcnS22OmJ53U958OL5jbWtLiVe6n+xTjyufq3wl6tAZDqTOYjTeEus3ncjb47HWsOuvcV59MYL/APVvySXdtpLllFPEd4lM1uNWlozb6jfWODuJ/AnOEX9ryTb4UFGPeMH5dC+aXr59JiO4uvtxvEhuBaYPE2Fb7L8RvH4e3nzSoLydWrJ8JtJ95y4S54XHPe3Xhu8POn9q7eGYyMqOY1XUhxO9cP1dryu8KCfdezm/mf7qbQEUeG7wnxg7bVO6lupT7VLbBc8peqdw15/+Wvp1PziXDoUaVvQp0KFKFKlTioQhCKjGMUuEkl5JL0PoAAAAAAAAAAAAAAAAAB18jd29hj7i+u6ip29tSlWqzflGEU23/RM7BC3jR1etJ7C5iFGt8O8zLjjLfh92qnPxP/pxn/VAa69dZ+41TrPM6jum/jZK9q3Uk/w9c20v5JpfyLF/o5NPSvdys9qOdPqo4zGKhGTX3ataa44/y05/1KtepsO8AGlv7E2Rebqw4r56+qXKfHf4VP8AVQX9Yzf+YCxIAAAAAAAAAAAAAAAAAAAAAAAAAAHWyl/Z4vG3OSyNzStbO1pSrV69WXTCnCK5lJv0SS5OwUZ8ce+P9uZCttppS95xdpU4zFxSl2ua0X/gprzhBrv7yXtHuEYeKPee93Z1h02bqW+mcdOUMbbPs6no69Rfty9F+FdvPlv1PCVsdX3T1K8vmqdSlpPGVUrqa5i7up2aoQf5cOTXkml2ck1hGxO2OY3W13b6dxrdC2gvjZC8ceY21BPhy+sn5RXq36JNq/W5Oe014eNh3DA2tOgrSl9jxNtLu691NNqU/wBrv1VJP14f0ArX499wLa6z+N2t0/8ADoYnT8IzuqVBKNNV3DiFNJduKdN+nrNr0Jp8CW20tH7YS1Rkrf4eW1J0149S+anaJfqo/Tq5c/qpR58iqXhv2/v95t5OrN1K11YUqsslnLmbfVVTnz0N/tVJPj346n6GzSjTp0aMKNKEadOEVGMYrhRS7JJeiA/YAAAAAAAAAAAAAAAAAAAHXyV7Z43H3GQyFzStbS2pSq161WajCnCK5lKTfkklzyB+ctkLHE4y5yeTu6NnZWtKVWvXrTUYU4RXLk2/JJFB/E94hclujerQ+g6d7T07UqxpS6Kb+0ZWp1fKuhd1Dnjph5yfDfol5nif31yu7uoKek9JU7yGmYXEadvb04v42TrdXEZygu/HPHRD+b78KNi/Cb4ebXbmzpar1VSpXWrbin8lN8ShjYSXeEX5Oo0+JT9O8Y9uXIPG8K/hltdJq11lr+2pXWoVxUtMfLidKwfmpS9J1V/SPpy0mrRgAAAAAAAAADXP45dw4az3cnhbCuqmL03GVlTcXzGdw2nXkv5qMP8A0+fUuR4ndx4bZ7T5HMW9WMctdL7Hi4+vx5p/Px7QipT/AMqXqau6s51asqlScpzk25Sk+W2/NsDMtjtE19w90sHpWnGXwLm4U7ua/Bbw+aq+fR9KaX1aNrtrQo21tStrelGlRpQUKcIrhRilwkl6JIql+jy25ljNNZHcXJUOm4yvNpjupd1bQl+smvpOaS/9P6lsgBWXxe+Ianoi1uNE6Nuo1NT16fTd3UHysdCS8l/4zXkvwp8vvwer4uN/bfbfFT0vpm4p1tXXlLvJcSjjqcl/iSXk6jX3Yv8AifbhSqf4dNnc7vPrKtc31xdUcHb1viZXJzblOpOT6nThJ/eqy55bfPCfL9EweHHZHPbw6ind3FWvZadtqvOQyUlzKpLzdKlz96o+e7faKfL57J7HdG6Zwej9OWmntO4+jYY60h00qVNf1lJ+cpN93J92/M+mlNP4fS2nrPAYGwpWOOsqap0KNNdkvdvzbb7tvu222emBBnjb15HRuyt7jrauqeT1DJ463SfzKk1zXn+Sh8vPo6kTW9HmU0kuW/JImzxnbirXm8N3bWNx8XEYJOws+l8xnNP9dUX5zXHPqoROn4P9BLXm9WMpXVJVMZif+0r1NcqUacl0Qfv1TcU17dQF8vDnoz+4ezWndP1aXw7yNsri9XHf49X55p/k5dP5RRIZwjkAfC+u7Wxsq17e3FK2tqFN1K1arNQhTgly5Sb7JJerPnl8jYYjGXOTyl5Rs7K1pyq169aajCnBLlybfkjXt4qfEPf7lXlXTWmatey0jRn3T5hUyEk+06i81BPvGH85d+FEMh8UXievdVyu9Ibe3Nay0++qldZGPMK18vJxh6wpP/mkvPhcp4n4bPDpnt0KtLOZmVbD6UjLvc9PFa84feNFPtx6Ob7L0Ummln3hW8MCztva613ItakMbUSq2GInzGVzHzVSt6xh6qHnLzfC7Su5aW9vaWtK1taFOhb0YKnSpU4KMIRS4UUl2SS7cIDxdCaP01ofT1HBaXxNvjbGl36aa+apL1nOT7zk/dtso54/9f09SbnW2krCv8Sy05SlCs4vtK6qcOp+fTFQj9H1ouNv1uBa7abYZXU9WUHdwp/Bx9KX/FuZpqnHj1SfMn+7GRqsyN5c5C/uL69rzuLq4qyq1qs3zKpOTblJv3bbYEo+EfSc9Xb96ctnDqtsdX/tO5fHZQo8Sjz+c+iP8zZ6iqX6O7QU8Xo/K69vqHTXzFRWti5Lv9npP55L6Sqdv/SRa4AAAAAAAAAAAAAAAAAARD4n95bHaXRnxLf4VzqPIxlTxlrLuotedaa/Yjyu34nwvdoIy8cO+MtN4+rtvpW8cMxe0v8AtW5pS+a0oSXakmvKpNPv7RfvJNV+2b0paaX0JkN7tW2lOpZY+fwNNWNePy5DIvlQm1+KlSacmvVwf7LT6vh/20zu+W59xc5i5uquOp1vtmdyMpczn1Sb6E/+8m+UvZcv04freMnXFhmtdW2htMxp2+l9IUvsFrQodqbrLhVZL344UE/3W/xMCD8heXWQv7i/vripcXVzVlWr1qkuZVJybcpN+rbbZcP9Hjto3K/3Pytt2XVY4jrX/wDGqr/SCa/8RFW9r9HZLX2vMTpTFR/3i/rqEqnHKpU13nUf0jFN/wAja1o3T2M0ppbG6cw9H4NhjreNCjH14S837yb5bfq2wPXAAAAAAAAAMD3x3PwW1Wia2oMv+vuJt0rCyhPipdVuOVFe0V5yl6L3bSYdffXdzTW0umf7SzE3c5C4Uo2GOpSSq3M1/wDbBcrmT8vTltJ0G134h91tVZqrfvVV9iKDmnSssZVdCjSSfKXZ8y/OTfP+hh25euNRbj6xudR6huXcXtw1CnTgn8OjTT+WlTj6RXPl5ttt8ts/Ov8AROX0Pe2GNzzo0cndWULytZRbdW0jNvohV9IzcUpdPfhSXPfsgu74Gt1tW7iYbUON1bdzyVxialCdG9lTjGUoVVP5JdKSbTp8p8c9/oWTK8eAnRU9NbNPO3dJwvNRXLulyuGreC6KSf5/PNfSaLDgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACJvEbvbgtotPxdSMMhqG8g3j8cpcc+nxajXeNNP+cmuF6tB6G/W8GmtpNNfb8rL7XlLmMlj8bTmlUuJL1b79EF6ya/JN8IorbW25vic3UqVn0VayiviVGnCzxlvy+Irz4Xnwu8pPl9+7TQ2k9wvEpujd39/fym24zyOTrQfwbOly+mnCK7c+ajTXHPdt+bNg+1W32m9ttJ0NO6atPhUYfNXrz4dW5qcd6lSXrJ/0S7LhAePsbtFpfabTn9n4Wk7nIXCTv8AJVYpVrmS/wDtgvSC7L15fLciAAAAAAAAAAAAAAAAAAAAAKI/pFdYrJa9w+jLaonSw1q7i5Sf/HrccJ/lTjF/5y8WayNpiMPeZW/qqjaWdCdevUflGEIuUn/RM1Kbjanu9Za5zOqL3n42Su53HS3z0Rb+WH5Rior+QHkYqxucnk7XG2VJ1bq7rQoUYLzlOclGK/m2jbpoTAW+ltGYbTlqo/CxllStYtLjq6IJOX5tpv8Ama+PA5o7+9O+ljf16PxLLAUpZGryu3xF8tJfn1yUl/AzZAByAAAAAAAAAAAAAAAAAAAAAAAAAYtutrjD7daFyOq81P8AUWlP9XRUuJ3FV9oUo/WT/ouW+yYETeMzej/Z1pJabwF0o6ozFJqnOEvmsrd8xlW+kn3jD6qT/D317YfG5DN5i1xWMtat3f3laNGhRprmVScnwkv5nq7i6uzOu9ZZHVOerqrfX1Xrko/cpxXaMIr0jGKSX5e5cLwG7Nf2Ti47n6jtOL++puOGpVI96NBriVfv5Sn5R/d5ffr7BMPhs2mx+0mgIY+TpVs3eKNfLXcfKdRLtCL/AGIJtL3+Z9uSmni+3Te6e5dLE4Cc7nBYiUrXHql832qtJpTqxS8+ppRj9En+JlhfHVu7/dLSK0Hg7rozebov7XOD+a2s3ypflKo04r91T8uzIr8BG0qz2op7kZy26sdiavw8ZTnHtWuku9T6qmmuP3mv2WBY/wAKe1MdrNtaVre04f2/lHG6yk1w+iXHyUU/VQTa/ic2uzJeAAAAAAAAAAAAAAAAAAAAAUR8bG+8dUX1XbrSF714S1qcZO7pS+W9rRfanFrzpwa8/KUl27RTcqeOHeeejdOrQmnLv4eey9Fu7rU5fNaWr5XZ+k590vVRTfZuLIw8DWyMNQX9PcvVNp14uyq8Yi3qR+W4rxfes16wg1wveS/d7hJPg02BhpCwttf6vtH/AHjuqTdlaVYf/L6cvxNPyqyX/Knx5t8WgOEcgAAAAAAAADg5Ib8XO6H+zTa2vKwuFTz2Y6rPG8P5qfK/WVl/BF9n+1KAFRvGxuYtebqVMRjq6qYXTvXZ27i+Y1a3K+NUX06oqC+kOfUjHaPRV/uFuHiNJ49SUr2ulWqpc/BorvUqP8opv6vhepikm5Sbb5bL5fo/9sngNHXO4OVt+nIZyPwrFSXenaRf3vp8SS5/KEX6gWV09ibDA4KxwuLoRt7Gxt4W9vSX4YQSSX9ERd4nt6MftJpJfZlSu9S5GMo420k+VHjs61RfsR9vxPsvVrK95dx8Ftfoi51Jm59bj+rtLWMkql1WafTTj7e7fok39DXbbUNd+IneWb5VxlMhLqqTfKt7C2j2/wAtOCfCXm2/WUu4Notv9W767mV1Vu7iqqtb7VmstWXV8GMn3fs5y4ajH6eiT42VaE0pg9E6WstN6dsoWmPs4dMIrvKT9Zyf4pN92/VnjbM7b4Ha/Rdvp3B0+qS/WXd3KKVS6rNd6kv/AGS9Fwvq82AES+K7cdbb7RZC9tK6p5jI82ONSfzRqTT6qi/gjzL8+lepLL8jW14ztylr/divZY+4+LhMD1WVo4v5alTn9dVX5yXSn6qCfqBB7bb5b5ZsK8BWgJaW2onqa+odGR1JUVxHlfNG1hyqS/m3Of1Uo+xTHYLQFxuVulidMU4yVpOp8fIVI/8ADtoNOo+fRvtFfWSNqlja29lZ0bO0owoW9CnGnSpQXEYQiuIxS9EkkgPsdXK5CxxWNucnkrujaWVrSlVr1601GFOEVy5NvySR9Ly5t7O0rXd3XpW9vRhKpVq1ZqMKcIrlyk32SSXLbNevi43+r7kZSppbS1zVo6RtKnzSXMXkakX2qSXmqaf3Yv8AiffhRDqeKnf+/wB0cpLT+np17TSFtV/V02nGd/NPtVqL0jz92Hp5vvwoy14TPDLTtadprrcnHqd1Lpq47D148qkvNVa8X5y9VB+XnLv2j2/B74cqWIoWe4WvrFTyk1Gti8bWj2tV5xrVIvzqesYv7vm/m+7bUAjkET+Kbc+O1+1t3kLSrFZvIc2eLj6qrJd6vHtCPMvbnpT8wKmeOzc5aw3HWksXcdeH05KVKbjL5a12+1WX16OOhezU/chna3R+Q17r/EaTxqfxshcKE6iXKpU13qVH9IxUn/IxyrUnVqyq1JynObcpSk+W2/Nt+5eP9Hvtm8Vpu83JylDi7yqdrjVJd4W0ZfPP/POPH5Q9pAWf0xhcfpzTuPwOJo/Bscfbwt7eHm1CK4XL9X25b9WekAAAAAAAAAAAAAAAADr5C8tcdYXF/fXFK2tbalKrXrVZKMKcIrmUpN+SSTfIHg7na2we3ui7/VOoK/w7S0h8tOLXxK9R/cpQXrKT/p3b4SbNbmbyGtvENvRGVG3VXJ5OoqVvQUn8Gyt488Ln0hBctv1bb45fB73ii3ivd4db0LDCU7laesaro4u1UX13NST6fjSj5uUuyjHzS7ebkW28ImykNrtJSyuaowlqrLU4u7fZ/ZKXnGhF+/PDk12cuF3UUwPL1xVwXhh8N08bp+pGWbu+be3uJJKpc3tSPz15L2hFNpeS6YR9eTXnVnOrUlUqSlOcm3KUny236snDxn7mx3B3WrWWOr/EwmA67KzcXzGrU5/XVV+ckop+sYRfqYDsloO93J3JxWlLRyp07ip13dZLn4NCPepP8+Oy920vUC2X6PfbX+y9NXu5GTocXeVTtcapLvC2jL55r+Oa4/Kn7SLYnSweMscLhrPEYy3hbWVlQhQt6UfKEIpKK/ojugAAAAAAAAeTrDUWI0npm/1FnryFnjrCi6terL0XokvWTfCSXdtpGsbxBbrZXdjXNXNXcZ22OoJ0cbZOXKt6XPr6Ocuzk/yXkkST4295v776qejNP3fVp3D1mq1SnL5by6XKcufWEO8Y+76n37cYj4UtoKu62vkshCcdN4pxrZOouV8Xl/JQi/efD5fpFSfnwBIPhI2qx+Lw91vhuHQ+DgcNRndYuhVj/jzh3+O0/NJriC/FLv6LmMMHb5ffrxCRVwpU6ufyLrXLi+fs1tHvJJ/uUo9K93x7k6+Pvce2sMbj9otOyp0KVOnSuMnToJRhSpxX6i34XZLspteiVMyD9H3tlPDaYvNxctbuF5mI/Z8dGceHC1jLmU/88kuPpBPykBaTF2NrjMba46xoRoWlrRhRoUorhQhFKMYr6JJI7IAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAI+333UwW0+i6mcynFze1m6WOsIz6Z3VXjy5/DBcpyl6L3bSYeb4i95cLtFpX7VWVO9zt5GUcbj+rh1JLzqT47qnH1fm32XuqP7c6L154j90b3JZG/qSjKcauVytWHNO2p+UYQj2XPC4jBceXL4SbPjpnCa98Sm8NxXurlO4rcVL27lF/Z8fbp8RjGPPkvKMOeZPlt/ekbD9rNB4DbjR1ppjTtv8O2orqq1Z8fEuKr+9Um15yfH8kkl2SA+m2mhtO7eaTttN6ZslbWlFcznLh1K9Rr5qlSX4pPjz9OyXCSRkwAAAAAAAAAAAAAAAAAAAAADgCvXjz1xHTGzktP21ZQyGo632WMU+JK3hxKtL8vuQ/zmu992Tf41ddrWe9t/a2tZVMdgY/2bb9L+WU4tutL+c248+0ERZt/pq81jrbD6XsF/vGTu4W8ZccqCk/mk/pGPLf0QF5/0fmingNpbnVF1R6LvUV18SDfn9mpcwp/1k6svqmiyZ0NPYqywWBsMLjaSpWVhb07a3gvwwhFRiv6I74AAAAAAAAAAAAAAAAAAAAAAAAHDaS5fka6PGdvEtxtbLAYO669M4SpKFGUJfLd3HlOt9YrvGH05f4uCxnjj3ZeidCLSOGuejPZ+lKE5Ql81taeU5/Rz7wj/AJ2u8UUDwGJyOfzllhcTazur++rxoW9GHnOcnwl9Pz9AJY8JG0kt0dxIzyVFvTmHcLjJN9lWbb6KCf77T5/dUvXgv3u7rzBbWbeXeo8jGEaVtBUbKzptQdes1xTpQXou3fhdopv0PO2O2/xG0G1lDDzr28KtKnK8y19J9MJ1unmpNt+UIpcLnyjH8yinik3cu93twYUMSq7wGPm7fE26i+qvKTSlWcfPqm0uF6RSXnzyHjaZxWr/ABA72SjcV/iZHLV3cXtz0v4dpbx4TaXpGEemMVz3fSue/Jsx0TprE6P0rjtNYO3Vvj7CiqVGHq+POUn6yb5bfq2yK/CPs7Ha3QrusrRg9TZeMat/LzdvFd4UE/3eeZcecm/NJE2gAAAAAAAAAAAAAAHD54fHHPpyIdXSutpy478LtyByAABjW5+scZoHQeW1Zlnzb4+g5xpqXDrVH2hTX1lJpfTnn0MlKS/pFtd1LjM4bbyzrNULWmsjfJPtKpLmNKL/AIY9Uv8AOgIZ2+wGpPEFvtL+0685VclcSvcrdQXa2totJqPPPCS6acF9YmzPBYvH4TDWeHxVrTtLGzoxoW9GmuIwhFcJL+RA/gV26p6R2nhqW8oRjltSdN1KTXzQtl/gw/mm5/51z5FhQAAAAAAAAAAA/NScKdOVSpOMIRTcpSfCSXm2zWJ4qtz3udupd39lVcsJjk7PFr0lTi/mq8e85cv36eleha3x17prSG360bibnozWoacoVXGXzULPyqS+jm/kX06/VGvgDPtgdvbnczdDF6ZpqcbNz+PkKsf+FbQac3z6N9or6yRs/wApf4HRWj6t9eVKGLwmItFy+OIUaUI8KKX5JJJd2+EiD/A1tbPRO3c9U5i2+FmtQxhVUZriVC1XenD6OXPW/wA4p90QL40t8FrvOvRWl7xy01ja3+8Vqcvlv7iPbq59acPKPo3zLv8ALwGC73bjak323Pt4Y+xuZ27q/ZMHi4fNKMZNd2l2+JNpOT8lwlzxHkvN4ZtnrDaXRKtqnwrnUF+o1cpdxXZyS7UoPz6Icvj3bb7cpLAvBfsXHQ+Fp641RaL+82Ro821GpHvj6El5celSa+96pfL2+bmyoAA4k1GLlJpJLlt+SAhzxdbmLbjae6lY3Cp5zMdVljkn80G1+srL+CL7P9qUPc1nSfVIl/xbbmrcrde6r2Fx8TB4pOyxvD+WcU/nqr+OXdP9lQ9jxPDptxcbn7o47T3E44+m/tWSqx/BbQa6lz6OTagvrLn0At54Btt/7s7c1taZG36cnqJqVDqXzU7OL+T8uuXM/quj2LKHysrW3sbKhZ2lGFC3oU40qVKC4jCEVxGKXokkkU/8aXiDdu7zbPQ97xW4dHNZCjL7npK2pyXr6Ta8vu+fVwGJ+MzxA/3surjb/Rd5zgKFTpyN7Sl2v6kX9yD9aUWvP8bXb5UnLIvBj4eYV4Wm5GvMf1U301sLjq8e0vVXFSL9PLoi/P7z/CY54NfD7DWFajr/AFpadWn6FT/s+xqx7X9SL7zmvWlFrjj8TTT7JqV8oxUYqMUkkuEl6ADkADiTUYuTaSS5bZrO8XW6C3L3Tryx9f4mBw6lZ43h/LUSf6ysv45Lt+7GBbHxvboLQ22ctPYy56M5qKM7en0v5qNtxxVqfRtNQX1k2vumul9wMy2X0Lfbj7kYnSdl1Qjc1eq6rJf4NCPepP8AlHsvdtL1NrOExllhsPZ4jG28LaysqELe3pR8oU4RUYr+SSK3eAXbKWmtDV9d5W36MlqCKVopL5qVnF8xf0+JL5vyjBlnQAAAAAAAAAAAAAAAAOCkfjj30hla1fbDSV4pWVGpxmrulLlVqkX/APDxa/DFrmT9ZJLyT5k7xnb5LQOClo7TF4lqjJUv11WnL5sfQkuOvn0qS8o+qXMu3y8108IOyNTc3U7z+oLef91MXVXxk+V9trLuqKf7Pk5v2aXnLlBKvgX2PjSo2+6eq7PmrP5sFa1Y/cj/APuWn6vyh7LmXrFqZfFvuO9udob64sq/w8zlebDHcP5oSkn11V/BDlp/tOPuS5QpU7ehCjRpwp06cVGEIJKMUuySS8ka3/GnuRHXm7dexx9f4mGwClY2rT+WpU5/XVF+ckop+qgn6gQYXx/R8bdPCaJvdfZGh03udfwbLqXeFpCXeX065r+lOL9Sn+y+h7vcXcvD6TtnKELutzc1V/wqEfmqT/NRT4+rS9Ta3hsdZYjE2mKx1vC3srOhChb0oLtTpwioxivySQHbAAAAAAAAK+eNTeF7faJ/uzg7ro1JnKUoQlCXzWlt92dX3Un3jH69TX3SaNd6nxOjNI5LU+br/BsMfQlWqPlcy9Iwjz5yk2operaNVe6etctuDrrJ6rzEv94vavMKSlzGhTXaFOP0jHhfXu/NgeVpbBZTU+o7DT+FtZXWQv68aFvSj6yb9X6Jebfok2bFJf3X8MHh6biqVzd0Y/wyyWQnH+vT2/ywh6td408BW1EcJh6+6+paUKFW6oyhilW4iqNv/wAS4fPl1ccJ9vlUn5SIQ8Ve69xu7uRSscGq1bBY6o7XFUYRblczk0pVenzbm0lFfsqPblsDzdmtH53fje6TzNxWrU7ivLIZy88uml1fNGPs5NqEUvLny4ibNbC0trCxoWNnQp29tb040qNKnHiNOEVxGKXokkkRP4VNpqe1e3VOhfU4PUOT6bnKVFw+mXHyUU/VQTa+snJ+TRL4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPzUnCnTlUqSjCEU3KUnwkl6sDxdd6qwmidKX+ptQ3atcfZU+upLzlJ+UYRXrKT4SXq2a5Nc6j1n4j95rehj7F/FuH9nxtipt0rO3XLcpy/rKc+O/kvKKMh8Xm8tXdLWVLTemqtWtprGVui1jTTbvrh/K63C8136YLz4bf4uFaPwjbK0trtJPKZmjCWqstTjK8l5/ZafnG3i/o+HJrzl27qKYGY7C7WYXafRFLB43puL6txVyV848Suq3Hn9ILuox9F9W25CAAAAAAAAAAAAAAAAAAAAAAABgPiB11T262mzmplOKvKdD4NjFv71xU+Wn29eG+pr2izPiiv6Q/X6ymr8bt/Y1ubbDw+1Xyi+zuakfki/4ab5/9R+wFVKs51akqlScpzm3KUpPltvzbLV/o69EPI60y+u7uhzb4mh9ks5SXb7RVXzNP3jTTT/8AMRVSnCU5xhCLlKT4SS7t+xtP8N+g1t1tBhdP1aUaeQlT+1ZHjzdxU4ck/fpXTD8oICRgAAAAAAAAAAAAAAAAAAAAAAADyNZ6ixektLZLUmauFQx+Ot5V60/VpeUV7yb4SXq2keuUg/SB7qO/zFDbDD3P+62Mo3OXlB9p12uadJ/SCfU/3pL1iBXLdnW+V3E19k9WZZuNW8q/qqKlzGhSXaFOP0jHj83y/UtH+j82o6YVt1M3bd5ddthYzXp3jVrr/WEX/H9Ct2wu3V7uhuTj9MW0p0rZt17+4iv8C3i11y/N8qK+skXd8SW6uK2O23sNMaUo0KWbr2qtsTbJJxs6EF0/GkvXjyin96XLfKTAjbx4b1RpUau1WmbrmpNJ524pv7sezjbJ+77Of04j6yS83wG7Lq9uIbp6ms+behNxwdCrHtOonxK549ov5Y/vcvt0xZE/hn2kye824Fe8zFa5eDtKv2nMXs5t1K85Ny+EpPu5zfLcvRcvz4T2T4yxs8ZjrbHY+2pWtna0o0aFGlHphThFcRil6JJJAdkAAAAAAAAAAAAAAAAAAAABw/JmsPxN3lfUviW1RTfEZyykbCmpT7JU1Giu/ovl5+nJs8fka3fGlorKaQ3yyWa+BUhjs5VV/Y3KT6XNpfEjz+1GfL49pRfqBsYw1hb4vEWeMtIKnb2dCFClFeUYQiopf0R2zBtiNcrcXazDardnVtK1zTdOvTmu3xabcJuL9YuSbT9n7mcgAAAAAAAADy9V53GaY03kNQ5m4Vvj8fbyuK9R+kYrnhL1b8kvVtI9QpN+kB3X+2ZCltdhbnm3tZQuMzOD7Tq+dOj+UU1N/Vx9YsCt27uucpuNuBlNWZRuM7upxQodXKt6Me1OmvyXm/V8v1M48Im13+0vdOgshQ+JgMP03mR5Xy1OH+ro/wCeS7r9mMyILG1ub69oWVnRnXubipGlRpQXMpzk+FFL1bbSL62V1hvCj4eaFO6hQvNX5ZyqfAT5Ve7cVzy13+FSXCb9X5cOYHw8b+9i0lhKm3OmLlRzeRocZCtTfeytpL7i48qk1/OMe/4osjjwO7HU9R3tPcnVlmqmJtKvGJtasfluq0X3qyXrCDXCXrJP0jw462F25z2/e695kM/e3FWwhW+25y/b+efVJ8UoeilPhpekYpvjsk9kmHx1jh8Va4rGWtK0srSlGjb0KUeI04RXCil7JIDtHIAAr744Nz5aH2z/ALvYu4+Hm9RKdvBxfzUbZLitP6NpqC/ibX3Sesle2uOx9zkL64p29rbUpVq9Wo+I04RTcpN+ySbNWPiC3FudztzslqWbqRsufs+Ooy/4VtBvoXHo3y5P6yYEfvuzYl4Gts5aK2v/ALxZO3+HmNR9FzJSXzUrZL9TD6cpub/iSfkVI8KG2X+03de0s72j14TGJXuTbXacItdNL/PLhfwqT9C8PiT3ixm0Oi41aNOjc569jKni7F/d5S4dSaXlTjyu3q+EuO7QYd4x99o7eYSWkdMXKeqsjR5nVhL/AOX0ZdviP/xJd+len3n+Hqrd4TdjLjdTUM89qKnXp6Usav6+fLjK+refwYy8+O/M5Luk0l3fK8XZTbjVG/2517d5TI13bKqrrN5Sp3mlNviEF5dcuGoryiov0XD2Q6R09h9KabsdPYGyp2WNsaSpUKMPRerb822+W2+7bbYHex9na4+xoWNjb0ra1t6caVGjSgowpwiuFGKXZJJccH3AAHXyV5a47H3OQvrinb2ttSlWr1aj4jThFNyk37JJs7BVvx/bn/2Bo6ht7irjpyObh8W+cX3p2il93/1JLj+GMl6gVK393Du9ztzsnqes5xtJS+Bj6Mv+DbQb6I8ejfLk/wB6TPr4eNu7jc3dPF6cUJ/YIy+05KrH/h20GnPv6OXaC+skR75s2K+B7bP+5G10c/kbfozWo1C6qdS+albJfqaf05Tc3/Gk/ugT5Z29CztKNpa0YUaFGEadKnBcRhGK4UUvRJJI+oAAAAAAAAAAAAAAAIu8R+72L2k0TK/mqd1nL1SpYqyk/wDEqJd5z47/AA4cpv35S7c8rKN0ddYHbrRl5qjUNx8O2t1006UWviXFV/dpQXrJ8fySbfCTZrc1Tm9bb/7vwnC3ldZTJVFQsrOEn8K0orlqKfpCK5lKXq+p+oH02t0Vq7fndatCveVq1a6qu7zGUqrlUKbfeXty/uwguF5Lsk+Nl+idM4bR2l7DTen7ONpjrGkqdKmvN+8pP1k3y2/VtmKbBbWYjajQ1HB2PRcZCtxVyV6o8Sua3H9VCPlFei7+bbJDAi3xS7grbnZ3K5W2r/Dyt5H7BjeH8yrVE11r+CKlP84pepq8k3KTbbbfuWJ8eO4X9691lpmxr9eN03GVu+l9pXUuHWf+XiMPo4y9yHtp9GX+4O4WI0lj+Y1L+uo1KvHKpUkuqpN/wxTf17IC336PPbp4vS2Q3FyNDpucu3aY/qXeNtCXzyX8dRcf+n9S2B0NO4iwwGBscJiqEbexsbeFvb01+GEIpJf0Xmd8AAAAAAAEe+ITca22v2wyOpJOnK/kvs2Noz/4tzNPo7eqjw5v6RYFU/H5upLN6qpbcYi4bx2HmquRlB9q1212g/dU4v8A5pPn7qIn8Mm2FXdPc+0xFeM44ezX2vKVY9uKMWvkT/am+Ir2Tb9CN7+6vMpkq97d1ql1eXVWVWrUk+qdSpJ8tv3bbZdXSt1jvCv4e43+UoUq+vNTfrqdnLzjNR+SM+O/w6SlzL3lNxT7poHjl3dt9OYGG0ekqkLe4r28I5R0OIq1teldFvHjyc48cr0hwu/X2x3wD7PK/vXulqGzUrW2m6eEpVI9p1U+J3HHtHvGPn83U+zimRFsPtxn99t1Lmvl724nZxq/bc7kZd5tSk30Rfl1zfKXokm+OI8GyzDY2ww2JtMTi7WnaWNnRjRt6FNcRpwiuFFfkkB2zkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFWvHhvA9Oad/wBnOAu+nLZaj1ZKpTl81vavt8Pt5Sqd1/An2+ZMnndvXGM260BlNWZVqVO0pfqaPVw69Z9qdNfVy4/Jcv0NdG3GnNRb+b4Onkrqc6+RryvctdpdqFBNdTivThdMILyXMV5ATH4DNnFlcit0dRWvNlZVHDC0ake1WvHtKvw/SD7R/e5fboXN4Do4DE4/BYWzw2KtadrY2VGNC3owXChCK4SO8AAAAAAAAAAAAAAAAAAAAAAAAB4mvNSY/R+jctqfKTUbTG2s7ia54c+F8sF9ZPiK+rRqZ1jn8hqnVOT1Flaine5G5nc1mvJSk+eF7JeS+iRb/wDSJbiqjYYzbXHV/wBZcOOQyfS/KCbVGm/zknNr92D9SlQEz+DfQL11vXjZXVD4mLwvGSvOV8suhr4UH+dTp7eqUjZeQF4HNu5aL2jp5q+o/DyupJRvavK4lC3S4oQf8nKf/qcehPwAAAAAAAAAHEpRjFyk1GKXLbfCSPDtNZaSu8o8Xaaowte+XnbUr+lKou/H3VLnzA90AAAAAAAAAAADgDCN89f2e2m2eV1TcOnO4pU/hWNGT/xrmfanD8ufmf7sZM1WZrJXuYy93lclcTuby7rTr3Fab+apUk3KUn+bbLE+Pfcr+8+4tLReNuOrF6dbjX6ZfLUvJL539ehcQ+j6/cwjwqaFxurdw55jUtSlQ0tpmg8plqtbtTcYd4U5fSTXLXrGMkBYnw/4fC+HjYS93M1rTcMzmqcJ07XyquDTdC2jz5Tl3nL2XmvkK1R/vr4iN632jPJZSp34T+BYW0P/AGhBfzk36uR3/ELunmt7dxbe3xVrcvFUa32XCY2EW5zcpJdbivOpN8dl5Lhejbuh4VtmLbafR7q5CNOvqfJxjPI148NUUu8aEH+zHnu/xS7+SjwGc7TaCwe22iLLS2Bpv4NBddavJL4lzWfHXVn9XwvySSXZGWgAAAAAAAAAAAAAAAAAAAAAAA6eWxeNy1t9lyuPtL+gpKXwrmjGrHlevEk1ydwAfK1t6Frb07a2o06FGnFRhTpwUYxS8kkuyR9QAAAAAAAAcSajFyk0kly2wI98Qe5Nntbtrf6iqOnUyE19nxtvL/jXEk+nlfsx4cpfSL9WjVrl8heZbKXWTyNxUuby7rTrV61R8yqTk25Sf1bbZMPi/wB1f9pW5dSjjbj4mnsK52uP6X8tZ8r4lf8AzNJL92Mfdkc7YaNyuv8AXOM0ph4/7zfVemVRrmNGmu86kvpGKb/09QJq8GejcVZXGU3n1pONrpvS0JO2nUXardcecV+JwTXC9Zzhx5Mw3cTVeqvENvNb0sdZz+Jd1FZ4mw6uY21FNvmT/Lmc5fR+iR7Pic3AxM7XHbRaCn8PR+mP1U6kH/8AMLqPPXVk195KTlw/WTk/Lp4sf4J9lJ6F069aaktejUeXopUaNSPzWVs+Gotek59nL2SS7PqAlbYvbXE7WaBtdN45qvcN/Gv7vp4lc12l1T49EuEor0SXry3ngAAA8jWeosZpLSuS1Jma3wbDHW8q9aXq0l2iveTfCS9W0gK3+P8A3QWD0nb7dYq46chmoKtkHF96dopdo/nUlHj+GEk/MoglKckkm5N8JLzZku6Ossnr/XmV1ZlnxcX9ZzVNPmNGmlxCmvpGKS+vHPqSt4LtvbLUuurnWupPhUdMaTp/bbmrX7UpVknKCk326YqLqP8Ahin94CxmzOHwPht8PNfVOr/1OWyCjc3tJcfFqVXF/AtIe8km+fZub8kVPvLrXPiP3pSp0oTyF8+mnT5fwMfawfq/SEU+W/OUn7ySO74i91MzvduPb2OFt7qeIoV/suEx8It1K0pNR+JKK86k3x29Fwvdu5/hZ2ZtNptGc3sadfU2SjGeSuF3VPjvGhB/sx57v8UuX5dKQZfs1tzgtsNEWumsJDrcf1l3dSjxO6rNLqqS/pwl6JJfUzQAAAAOjn8rYYLB32aylxG3sbG3ncXFWXlCEIuUn/RGqTeDW99uJuJl9WXycHe1uaNFvn4NGK6adP8AlFLn3fL9S3f6QjclYrS1ltzja/F5luLrI9L7wtoS+SD/AI5x5/Km/cov5sCU/C3ttLczdiwxlzScsPY8XuUl6OjBrin+c5cR/Jt+htBpxjCChCKjGK4SS4SXsQZ4LNs5aA2qp5HI2/w83qDovLpSXzUqXH6mk/yi3Jr0c2vQnUAAAAAAAAAAAAAAHnakzWL05gb3O5q9pWWOsaMq1xXqPtCK/wBW/RJd22ku7O7Xq0rehUr16sKVKnFznOclGMYpcttvySXqa9PGFvxLcfMf3V0xczjpOwq8uouV/aFZf8R/+Gvwr1+8/RRDEfERu3m959dUnbW9xSxFvUdDD42K6pvqaXXJL71Wb47Ly7RXPHLuP4R9kaO1+lv7XzdCnPVuTpp3Uu0vslJ91Qi/fycmvN9u6imR/wCCrYGrg40NyNbWDhk6kerD2FaHe2i1/jzT8qjX3U/uru+7XTbGvcUKEHKtWp0orzc5KK/1A+phO+OuaG3W12a1VUcHXtqDhZ05eVS4n8tKPHquppv6Jnp5PXeicXz/AGlrDT9m12ar5KjB/wBHIpf48t2cVq/KYjR+lstbZLE2Cd5d3FrVVSlVuJJxhFSXZ9EOfL1qNeaArDfXVxe3te8u6069xXqSq1ak3zKc5PmUm/dttl0/0dWgPs2Iy+41/Q4q3cnj8c5LypRadWa+jkox5/cl7lLsZbwu8jbWlS6o2kK1WNOVes2oUk2k5y478LzfHsbL9t9ydlNJ6Mw+lcXuJptW2NtIUIyneRp9bS+ab547ylzJ/VgTADwdPay0jqKp8LAanwuUqdLl0Wl9Tqy4T4b4i2/M94AAAAAA4NeHjp3KWst0P7tY6v14jTfXbpxfy1bp8fGl/l4UF/DL3LieJfcSO2u0uUzlGrGOUrx+x4yL83cVE0pcevQlKf8Al49TVvWqTq1ZVKk5TnJtylJ8tt+bb9wJZ8MeBwktU3mv9YSVPS2j6Ub+65XP2i4b4t6EU/OUprnj16OHxzydTWOoNZeIPeWl9ntnVvsjVVtjrKMm6dpQXLUefSMV1TlLjv8AM/ZGG3GfymR01i9H2VF07GhcSrK2oJuV3dT+X4s0vvT6emEV6Jdu8pN348H2xq2z09LUWoaMZarylFKpF8P7DRfDVFP9pvhzfukl5csJD2K20xO1egbXTeOca9y38a/vOniVzXaXVL6RXCUV6JL15bz0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGKbuawttBbb5zVt10tY+1lOlB/8AErP5acP5zlFfzApb4+typ6j3ApaFx1dvF6ffNz0v5at5JfNz79EX0/RuZO3gW21Wjtr1qfI2/RmNSKNx8y+alar/AAYfTq5c3/FHnyKd7FaQu92d7sfjMnUqXNO7up3+WrSfeVKL66rb95N9PPvNG0ihSp0KMKNGnGnTpxUYQiuFFJcJJewH7AAAAAAAAAAAAAAAAAAAAAAAAPO1Nmcfp3TuQz2VrKhY4+2nc3E/aEItvj3fbsvVnolSP0he5X2DB2O2uMr8XGQUbzKdL+7QjL9VTf8AFOLk/pBejAqFuXqzIa615mNWZNtXGSuZVejnlUoeUKaftGKjFfkZJ4b9v6m5O7eIwE6UpY6nP7XkpLyjbU2nJN+nU+mC+s0RwbDPAftu9I7YS1VkaHRldSdNePUvmp2kefhL6dXLn9VKPsBYilThSpRpUoRhCCUYxiuFFLySR+wAAAAAAAdbKX9ni8bdZLI3NO1s7WlKtXrVHxGnCKblJv2STZ2SuX6QHVNxg9maGFtKk6c87fxt6so+tGCdSS5+rUF9VyBW/wASHiK1HuTlLnC6eubrE6TjJ06dtTfRVvVz9+s134fpDyXbnl9yFczi8tp/M1cblrO4x2RtnH4tCtBwqUm0pLleafDT9zNdhMtpbTOq7vWOqIU7uWDspXWKx81z9sv+qMaMX+7Ft1G/ToXn5P1NiNCZjezeXjJVale3ncSyOcu5esHPqmuf2pyfSvzb8kBsE8P91mb7ZPR95n6tStka+Jo1KtSpLmc048wlJvu5OHS2/dmdHzoUqVChToUacadKnFRhCK4UYpcJJei4PoAAAAAAAAAMC3+3At9tNrctqebhK7hD4GPpS/4lzPlU1x6pd5P92LM8KEfpBdwHnNwrPQ9jXcrLAU+u5UX2ldVEm/z6YdK+jlNAVnvbm4vb2td3NWde4r1JVKlSb5lOcny5N+rbbZmeZ1f/AGZtzR2909UdO1uasb3PXMezvbhfcpc+tGkuOF5Sn1S8ukwUtt4Ktgf7Zr2u5OtLLnG0pKph7GtHtczT7V5p/gT+6vxPv5JdQZt4JdiJaZs6O42rrNwzV1T/AOy7SrH5rOlJd6sk/KpNPsvwxfvJpWrODkAAAAOByvcDkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAK5eOTdl6K0ItIYa56M7qClKE5Ql81tafdnP6OfeC/zvzSJ11pqTFaQ0rktS5u4Vvj8fQlWrT9Wl5RivWUnxFL1bSNVe7Ot8puJr3J6ryzcat5V/VUermNCku0KcfpGPH5vl+oGKt8vkm/GXtTZTaqdejL4WvdbWS+E12nisVJ/f59KtZrle0Yp9nxzg20uOwccpcaq1ZTVbT+CUa9a16umWQuG38G0j/HJNyfpThN+xkm3ul9VeIfem4qXty4yu6n2rKXkY/JaW6aSjBenC6YQj9F6JsCQPA7sutX6iWvtR2vVgsTWX2KjUj8t5dR7ptesIdm/Ry4XdKSL9nl6TwGK0tpyw09g7SNpjrCiqNClH0ivVv1bfLb9W2z1QAAAFMP0hm5vVUstr8VcdodF7l3F+vnRov8A/I0/emy1G6essdoDQOX1Zk2nRsKDnCnzw61V9qdNfWUml9OefQ1R6rzuS1NqTIagzFw7i/yFxO4r1H6yk+e3sl5JeiSQHXwuNvszl7PE423nc3t5XhQt6MFzKpUk0oxX5tomrevWNpo3Q9tsVoq6hOysJdepsjRf/wAxv+U6lNP1pwklH6uCXlHmUY6B1T/c+eQy+PpVP7fnbu2xt0pcKy+InGrXj6/E6OYw9uuUvOMSbvBZsctc5ta41TaOenMdW/3ahVj8t/cRfk1604Pz9G+I911ICVfA7sctPYyjuVqqz4zF7T5xNvVj3tKEl/itPynNPt7Rf7zStYcJJLhHIAAADpZzJ2WFw17mMlXjb2VlQncXFWXlCnCLlJ/0TO6VZ/SDbjf2Joqz0Bjq/Te5x/Hvel94WkJdk/45rj8oSXqBTjdnWd9uBuHmNW3/AFRnf3DlSpN8/BpL5adP/LBRX1fL9TMvCbty9xt38fZ3dD4mHxnF/kuV8sqcGumm/wCOXTHj26vYiTzZsg8E23X9xtoaGTvqCp5fULjfXHK+aFHj9RTf5Rbl9HUa9AJ1SSXCXCOQAABDe+/iH0XtZOeMqdeb1CoprG2s0vhc+Tq1O6p8+3Dl5duHyBMYNc2t/Fnu1nrmp/ZV9Z6ctJPiFGxt4zml9alRSbf1XT+R8tD+K3dvAZGlUymWoaislPmrbXtCEZSj6qNSEVKL9n3XPowNj4PH0Xn7TVWkcRqWxhOFtlLOld0oT+9GM4qXD+q54/kewAMf1drbSGkaPxdTalxWJXHKjdXMYTl/DFvqf8kdjW1lmMjo/MWGn8gsblriyq0rK7a7UasotQn/ACfHf0NXm8W3+sdB5qNPXF1ayy145VehZCNzXqR5/wAWfDbSb54cuG+/C7MC8OpvFps9h5ShaZHJ5ucfSwsZdL7ftVHBEe57xvYenGSwWgr65b+7K9v4UUvP8MIz59PUhLw2eHzL7v0bzMV8ssLgrSr8B3LofFqV6vCbhCPKXCTXMm+3K4T78ZX4idntp9mtN06VTL53O6pyMJfYLSdenSpU4+Tr1VGHPSn5LldUu3kpNBjW7/if3A3D07c6bnQxuExV12uIWMZ/FrQ/7uVSUn8r9UkufJ9m0Qzgche4rMWuTx3R9staqq0HOjGqlNd0+iSafD790yYPCXsvW3T1i77LUpw0tiakZX0+6+0z840Iv3fnJryj7No2Gac0dpPTdFUtP6axGLiv/wBpZ06bf5tLlga25al8QGsOqlRye4OVhN8unbO5cHzz6QSXHmdiw2L321JOM56RzkutdXXka8aPp6/FmnzwbOOPz/qOF7Aaz9QeGjdbT+nMhn83jsXYWGPt53FxUqZKk+mMVy+FFvlvyS9W0iGS+n6QzXMcRt5j9E2lbi7zldVrmKflbUWnw/4qnRx/BIobCMpzUIpylJ8JLzbAl7w7bEZneKnl7m0y9DD2eNdOm69ahKr8WpPl9MUmvJLl9/xR9yYn4Hsh0crce2c/Z4mXH/5Sxnhs0DDbjaHD4GpRjTyNSn9ryTXnK4qJOSf8K6YflAkkDXTuR4Wd0dC0KeYwkoajpU6vZ4iNT7VR9punx1f8rlx/qXC8LN/r3IbQWE9xrS+t8xRrVKNOV7TcLitQjx0TqJ9+rzXL7tRTfPPLlQAAePq7U+ntI4armdS5izxVhT7OtcVFFN/sxXnKT9IpNv2Ky7g+NPTthcVLXRWmbrM9LaV5e1fs1J/WMEnOS/PpYFsjgodZeNjXsLuErzSum69upfPCn8anNr2UnNpP69LJ30/4otDZfaTM61nCpYZDFRjTq4mvNOpUr1FL4UKcl9+MnF/NwmlGTaSQFdfH3r56j3TpaTs63VYacpOnUUX2ldVEpVH9emPRH6NSK2ndzuSvM1mr3L5Cq615e3E7ivUf4qk5OUn/AFbLR+CzYCjqOVvuPrS0VTE0qnOKsKsflu5xf+NUXrTi12j+Jp8/KuJBlXgl2DljYWu5usrNq9nHrwtjVj/gxa7XE0/xtfcXovm82um3pwlwuEcgAAAOJSUVzJpL3ZD+/XiA0btbbXOPncRyuplS6qOLotvpb+66s12pr14+815LvyUF3O3d19uJkalzqPP3MqEpc07G3m6VrSXoo00+H+cuX7sDahSyeNq3KtqeQtJ135U41ouT/lzydo1X6K2V3Q1ZpOrq7T2mbi4xVKM5wuPjU6cq3Rz1fCjKSlPjhr5U+WuF37Eq+ETf7U2C1ni9EapyVfKYDJV4WlvK6m51bGrJ9NPpk+/Q3xFxfZc8rjhphfwAAAccrzIW8QPiI0ntZTljKCjnNSSjzHH0KqUaHPlKtPv0fwrmT7dknyBNINXW4O/u6ms8jO4vNV3+Ot3LmnZ4ytK2o016L5H1S/OTbPxpDdjefTVqs9itT6lqYyjX6J1LqVS5tHUf4JfE5hy/bz9gNpIIY8Le99ru9p64oX1vRsdSY1R+229Jv4dWD7KtT579LfZrl9L4790TOABxyvc+F9e2djRde9u6FrSXnOtUUIr+baA7AMBz+821WCco5HX+n4Tj96FK8jWmv8tPqZgma8WezWPlKNvlsnlOl/8A9JjqnD/J1OgCeQVTyvjZ0dScli9HZ6748ncVaVBP+jmYvfeOC/cmrPbu2prh8OtlZS7+nlTQF1AUJv8Axp7iVaylZad0xb0uPu1IVqj5/P4i/wDY+UPGjuYpJywWlJR57r7PXXP/ANUC/YKO4vxualp1F/aeh8Rcw57q2vKlF+f7ymSNpHxnbfZGrGjqLCZnAyk+9VRjdUY/m48T/pBgWcB4mjtWab1jiI5bS+asstZSfDqW9RS6X+zJecX9Gkz2wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVK/SPaqla6W05o63quLv7md9cxi/OFJdME/o5Tb/OBbU14/pAMpVvt+FYyl+rx+Kt6MF/F1VG/wDrX9AJO/Rv6UjTxOptbV6SdSvWhjLabXdRglUq8fRuVP8A5S4BEPg6wscJ4dtLU+hRqXlGpe1GvxOrUlJP/l6V/Il4AAAAAAAAAAAAAAAAAAAAAAAADzNV53G6Z03kdQZeuqFhj7edxXm/SMVzwvdvyS9W0jVDujrHI6+17l9WZP5a+QuHUVNPlUqaSjCmn7Rior+XJaz9IZub8K2str8VcLqq9F7l3F+UU+aNJ/m18Rr6Q9yloEieHXb2tuZutitOuEv7PhL7Vkpr8FtBpz7+jlyoL6yRtPtqNK2t6dvb0oUqNKChThBcRjFLhJL0SRXbwI7aPSG20tV5K36MtqNRrRUl81K0X+FH6dXLm/dOPsWNAHzua9G2t6lxc1qdGjSg51KlSSjGEUuW232SS9TzdXajwmktO3moNQ5Cjj8bZw661ao+y9Ekl3lJvhKK5bbSRr48R/iP1DuZWucFhXWw+k3LhWyaVa7SfaVaS9PXoXZevU1yBPu6PjG0hp/IVcbo/D1tT1aTcZXbrfZ7Xn9x9LlNfXhL2bMXw/jhoyrwhl9u6lOi381S1yinJL6RlTSf/MimJfjZHZHZPXGwuPr2OLp319f2PTd5GVdu6trzp+ddnxBwn5R44aSb6k+WExbO7s6N3VxFW+0tfVHWt+FdWVzBQuLfny6o8tNPjtKLa9OeU0Z4axPCtnMno/xF6do0Jyg7q+/sq9pJ8KdOrLoaf5S6ZfnBGyLUGq9MaeoOtntRYnFwj5u7vKdL/wC5oD2Sufj/ANI32odnKGZx1Gdapgb1XVeEVy/s8ouE5cfutwb9kpP0PS1x4sNpNPQq08dkbzUV3FNKnj7d9HV9ak+mPH1j1FfdwPFPuZuDWlp3QuD/ALGpXSdP4NnTd5e1ovs11dPCTX7MU/qBWQ2Y+D/QOC0TtDYXOLvrTJ3uahC9v763kpQnJr5aUZL8NNNx4f4up8LnhVGx3hO3hvtLUs3HGY+hcVW+MZcXap3Sj6Saa6Fz7OSa9UjCsxgt3to6sat5Q1NpWM6nRGvRr1KVGpPz4U4S6JPt7sDaoClPhJ8SOqslrew0Lru9eXt8nP4Njf1IpV6NbhuMZtJdcZcccvum1348rrAAAAODCt3N0NIbX4B5XVGQVOdRNWtnR4lcXUl6Qhz/AFk+Irlcvuih+9XiY19uDXr2WOu6mm8DPmMbKyqtVKkf/FqriUufVLiP0fmBfHVe7G2ula9W2z2tsJZ3NHtUt3dRnWj+dOHMv9DraX3m2s1NewssNrnDV7qclGnRnW+DObfpFVFFyf5GsDSOmNSawzUMRprEXuVv6r5+Fbwcml+1J+UV7yk0vqTHmfCVu/jtNxy8bPF3txyuvHW151XNNe/dKD4/dkwL+bg6msdG6JzGqMi19mxlpO4lHnjraXywX1lLiK+rRqW1Hl77P5+/zeTqute39zUubif7U5ycpP8AqyRNab0a5zO1lntbl72lcWdhcfr7tVPi1bmMH+rpSmm1KEH6rnniPfhd8U2n0fea93Fwuk7LtPIXKhUn/wB3SXzVJ/ygpP8AkBMHhD2Bq7jZKGrNUUJ0tJ2dXiFJ8xeRqRfeC/8ADT+9L1+6u/LjsKt6NG3t6dvb0oUqNKKhTpwioxjFLhJJdkkvQ6+Gxthh8Va4rF2lK0srWlGlQoUoqMKcIrhJJHcAAAARLvlv5ojaqnKzvq0srnnDqp4q0kutc+Tqy8qcfz5fqosjPxY+JWGkp3OidA3NOrnlzTv8jHiULH3pw9JVfd+UPrL7tGa9W/y+TlVq1Lm+vrurzKUnKpVrVJP1fdyk2/zYE3a98Vu7Go72o8Vk6Gm7Fv5LewpRckv3qs05N/l0r6GLYHfzeHD3Mbi215l6/E1Jwu5q4hJ+zVRPt9OxPfh88ItGrZ2+od1FVU6iU6OEpVHBxXp8ea78/uRa49XzylOG71ps5tztPdQ1LpfC08Emo0cbStYRndV13hCHHDc+33uey5bfHIH68LO6t5uzt1UzOUsKVnkrG7dldOgmqVWShGanBPlrlSXMeXw17NEtFHtmvFnh9O3tHT9/t/idP6XlWfw3hupStVJ/fnGX+K/Lqa6X254fkXeoVadejCtRnGdOpFShKL5Uk1ymgP2AfivVpUKM61apCnSpxcpznJKMUly22/JIBWq06NGdatUhTpwi5TnN8KKXdtt+SKWb3+L/ADFvq6ri9s6eNnibOXTLIXVB1XdzT7uC5SjT9E+OX58o8fxeeI7+9SudCaCvJRwPLp5HI03w773pwfpS93+Py+796sun8Tkc9m7PDYm1ndX97WjQt6MF3nOT4S//AO+gGx/wm7xZPd3SmTuc3i7eyyWLuYUqtS1UlQrRnFuLipNtSXDTXL9H68KaG0lyyFtJ09DeGbZOyttQ5KlRqvmtdOmuqtf3ckutUoecuO0V5JRSba7sqdvX4idebq5F6f05Su8Phbmao0cbYtyuLtt8JVJR7yb/AGI/L/F5gXU1TvntJpm+djl9dYqFzF9M6du5XLg/aXwoy6X9HwZBoHcDRmvbOrdaR1FZZaFF8VY0pNVKfPl1QklKKfo2u5rl1xsTrTQ+2MNb6t+zYpVrynbUMbOXVcS64yfVLp+WHCi+zfPvwfvwj6ivtPb/AOl52lacKd/dLH3MF5VKVX5eH7pS6ZfnFAbPgcLyRyAAAAA4A5BFm5O/+12gcqsTmtQqvkVJRq21jSdxOh7uo49o8fst9X0JKxd/aZTGWmTx9eNezu6MK9CrHyqU5xUoyX0aaYHZAAAAirxP7p0dq9tLjI29SDzl/wA2uJpS4f61rvVa9YwXzP0b6V+ICtXj63ZWb1BT21wdz1Y/FVFVyk4S7Vbrj5afbzVNPv8AvPhrmBVNd2fS8uK95d1ru6rTrV605VKtScuZTlJ8uTb8222z5AexSlkc3Uxmm8Va1K7dX4dtbUY8yr16jScuPWUuIxXsoxXu3sr8M201ptPt9Sx1RUq2dvumvlrmHdSqcdqcX+xBNpe7cn26uCGPAdswsfY090tSWn++XUHHCUake9Kk1xK44/akuVH93l9+pcW7AAAAAYNvtr+1202xyuqa7pyuaVP4VjRn/wAa5n2px+q5+Z/uxkBUz9IHuaszqq125xdfqssPJXGRcX2ndSj8sP8AJCX9ZtP7pVQ7WWv7zK5S6yeQuJ3N5d1p169ab5lUnJuUpP6tts7Wk9P5bVOpLDT2DtJ3eRv6yo0KUfVv1b9Ely2/JJNgZv4ddqcjuzr2lh6TqW+JteK+Uu4r/Bo8/dj6dcvKP835JmzzTuGxunsFZYTD2lOzx9lRjRt6NNdoQiuEvq/d+bfLZhmwG12L2p0Db4CzcK9/VarZK8S4dxXa7teqhHyivbv5tkhgAAAAAHzr1aVChUr1qkadKnFynOT4UUly237GqvxBa7nuNuxm9TRnJ2dSt8GwjL8NtT+Wn29OUupr3ky8njb109HbJ3tjaXCpZLPz/s6gk/mVKS5rSX06OY8+jmjW6+7Aknw07fy3H3exGCrU3PHUZ/bMk/RW9Npyi/4m4w/zG0uEYwgoQioxiuEkuEl7FZf0fu3z0/t1d60v6HRfahqJW/Uu8bSm2o/l1z6n9UoMs4AAK2eM7fWpoLF/3L0rcqOpchR6ri4g+9hQl2TXtVl36f2V83rEDyPFj4l46WqXWh9v7mnVzaTp3+Tg1KNk/WnT9HV935Q8u8vu0ZuK13kL6devVrXV1cVHKc5yc51Jyfdtvu22/wCZ8pSlOblJuUpPlt922Xs8Hfh3o6atLTcDXFlGpna0VVxthWhyrCL7qpNP/jNd0vwL977oYh4d/CTLIW1vqTdKNe3oz4qUMJTk4VJR8068l3jz+xHh+7T7HmbyeGzV+Z32qWmkNJWWJ0pdOhC3u7aUY29vSVOMak5x56uvlSfHHMnx588l6gB52lsLZac03jcBjYOFnjrWna0E3y+iEVFc/XsekcNpLllR/E/4p6OL+1aQ2xu6dxfd6V5moNSp0PRxoekp/v8AkvTl94hlvii8SeO27jcaW0lKhkdVuLjVqPiVHHcrzn+1U9oeS85fsutWwuzuqt+dW3mptSZK8p4dXHVkcrWfVWuqnm6VLns5cccvyguOz7J9zwx+H3LbrZB6o1TVu7PTEazlOs2/j5Gpz80YSf4eeeqo+e/ZcvlxvLnMlo3aLbapeVaVDD6fw9DppUKEfP8AZhBfinKT9e7b5b82Bj+u9UaH8Pu0lL7NZUrazs4fZ8XjaUuKl1WfL45fL7vmU5vn1fdtJ0U07i9ceJHeqrUua6+1Xkvi3lz0P4GPto9kox5+6lxGMeeZSfd92z57i6w1p4h927O3tLOc6txUdtiMZTnzC2pvu235c8LqnN+3okkr7+HzabD7SaJhiLNwuspc9NXJ33Tw7iql2S9VCPLUV+b82wMn270dg9B6RsdMaetVb2NpDjl8ddWb+9Um/WUn3b/kuEkjIQABw/I5MA8Qusv7h7O6i1FTrKld07V0bJ+v2ip8lNpevDl1flFga/vFhrb+/O9+cv6Nb4thYVP7OsWnyvhUW02vpKfXL/MjseEHQ39+d8MRQuaDq43Ft5K95Xy9NNroi/4qjguPbkiGTcpNtttvu/cv9+j50SsHtXd6tuaXF3qG55ptrurai3CH5czdR/VdIFlzkAARD4i99dPbR4pW8oRyeo7qm5WeOhPjpXkqlV/hhz/OXHC9Wv34mN58ZtJpJVKapXeor+Mo42yk+3K7OrU47qEf6yfZerWtfVOey+p8/d53O39a/wAjeVHUr16r5lJ/+ySXCSXZJJID1tzNwdWbi6gnmtV5WreVuWqNJfLRt4v8FOHlFeX1fHLbfcyvZLYfXW6k1dYq1hj8LGXTUyl6nGk2vNU0u9SX5dl6tEq+FDwzPVVG21tuDbVaWElxUsMa+YTvV6VKnrGl7Lzl59lx1Xf/AOytP4XytMZi7Chz26aVG3pQX8lGKS/JAV0wfhD2pwGlryeq8nkcjXjQlOtkqlyrWnapLlzhFfKkl3+dzRSrcmWkLfU13jtBTyVXAUKnTSub+pGVa7kuV8VqMYqMe76Y8c8d33fCmrxb+Iie4NWpo7R1atR0tRqc3Fx3hLIzT7crzVJPuovu3w2uySr7qPCZPT2Uli8xbStL2FOnOrQn9+n1wU1GS/DLpkuYvuueHw+UBkuxmjP9oG6+A0pPr+zXl0ndOD4caEE51Gn6Ppi0n7tG1jF2NnjMbbY7H21O2s7WlGjQo048RpwikoxS9Ekkiln6N/Sfx8/qXWten8tpQhjrWTXZzqPrqNfVRhBflMu4AAAAr34vt+Ftph46a0zWpz1ZkKXUp8KSsKL7fFafZzffpi/ZyfZJSy3xIbz4baTSrqydK81DeQaxuPcvvPy+LU47qnF/zk+y9WtaWqc9ltT6hvc/nL2pe5G+qurcV6nnKT/0SS4SS7JJJeQHUyN7eZG/r39/dVrq7uKjqVq1abnOpNvlylJ922/UlzSPht3O1NtzU1pj8bRhScVUs7CtNwuryn6zpxa449UpNOXHbntzIngs2Dpaqr0twtZWSqYO3qP+zbKrH5b2rF96k0/OlFrhL8Uk+eyale1RUYqKSSXZJAa9Nn/EPrzZbHrRGpdLzv8AH2c5fBs73rtLm15k3KKk4vmPLb4cX59nx2ITuM/D+/lTU9lZK2h/ajv6Nt18qmvi/EjDq49Oy54NkXij1LgNH7SZbO5bH469vXSdri6d3bwq9VzUTUOFJP7veb+kWUq8HG3druFvBQjl7KF5hcTRle3tKpHmnVf3adOXo+ZtPj1UZAShkfG/m505LHaAx1CfHyyr5GdVJ/VRhHn+p5H/APMT4jNb80dJadjQ6uynisJUrteveVTriu30LqYrRWjsTLrxelMFYy/at8dRpv8ArGKPH3p3AxW2G3d/qjIxVR0UqVnaqXS7ivJPopr2XZtv0jFv0A10bx5TeC0y1LH7lZrPRu7iirmNndX/ACowbaT+FCXTDlp9uEyOJOdSfLblJv17tnra01JmNX6ov9R566ldZG/qurWqPsufJRivSKXCS9EkWt8EOw1C7pWu6GsLNVKfV14Syqx7Saf/AMTNPzXP3E/bq/ZYECat2P3I0voTHayymArLHXkHUqQppyrWcfwuvDj5FJd17eUuH2Mw0t4iqllsXfbU5/RlhlbGdhUs7O4o1vgOl1cuM5w6ZKcozal1Lpba79+5sblGMouMkmmuGn6lVvHbY7d6Z24TpaSwUNTZq4VG0uqVpCnWpwg1OrV6opN9uI9/WYFSdltys3tXrP8AvPg7e1ua8rapbVKFypOnUhLh9+lp9nGL8/QlvJeL/d7LN0MVYYGynJNL7LYTqzX1+ecl/odvwDbbYrV2qs7qHUmFtMpi8ZbwoUaV5RVSlK4qPnq6X2bjCL8/LrTL2YnC4fEUFQxOKscfSj5QtbeFKK/lFIDXpW1D4qtdyfwZa7qUqvraWk7Kjw/rCMI8fzPvY+GDffU9ZXObo0LWc3y6mVyqqT/N9LmzYlwcgUiwPgiz1Th5zXeNtPeNlZTrf6ycP/YkHBeC7bm1jGWWzuoslUXHKjVpUIP+Sg3/AKlnABC2I8LuymPak9JSvZrh9V1f15/6KaX+hleO2X2nx/Q7bbvTXMPuyqWEKj/rNPkz4AeHjdH6TxlsrbHaYwtnQTbVOjY0oRTfd9lE7M9P4GcXGeFxsovzTtabX/semAMRyW2O3OSUvt2g9M3DkuHKeLo9X9enkjzW3hY2g1FbVfseDq4C8kn03GNryiov0/VycoNfRJfmicQBR7w67Qbwbb+Im2j/AGZeU8BSrVaN/fwqRVrd23TLplxz3bfS1HjqT9uGXhODkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGuDx2UqlLxF5Wc+OKtnaTh39PhKP/ALxZsfKQ/pHdIVqGo9P64oUW7a6t3jrmaXaNWDlOHP1lGUuP4ALLeGG9t7/w/aJr20XGEMTSotP9qnzTl/1RZJBVj9Hjru2yegb/AEHdXCV/h68rm1pyfedtVfL49+mo5c+3XEtOAAAAAAAAAAAAAAAAAAAAAADG9zdYYzQWhctqzLSX2bH0HUVPq4dao+0KcfrKTUV+ZkNapTo0pVas406cFzKUnwor3bfkUN8eu7FvqfUlnoTAX9G5xGKauLyrQqKcK11JcKPK7NQi+O34pyXoBXXWuo8pq7VmT1Lma3xb/I3Eq9ZryTflGPtFLhJeiSMy8N+3n+0fc6yxd5+qwlmvtmXryl0xp28GuYuT7JyfEV+bfoyNTP8AbbavczXMJ0tKaeyVaxuOFVuJv4FrJJ8rqnJqMuH347v6AXz1t4jdntD0/wCz/wC8FPJ17eKhGzw1P7R0JLhR601TXHHHHUQhrzxs3lWnOhojR9K3bfy3WWrfEfH/AJVNpJ/nN/kfvb/wUV6kadzrvVkaPrKzxNPqfH/m1Fwv5Qf5nV8VOltrtl9BUNOaT0zZVdR59ShK9vm7qvb20eOupHr5UJSbUU4pfia7pAQBunu9r/ctUKWrM5K5tLebqUbSjSjRowlxx1dMUup8NpOXLSb482eLtvorP7gaus9MabtPtF7cvlyl2p0YL71ScvwxXq/yS5bSMfoUqtevChQpzqVaklGEILmUpN8JJerNlPhK2dpbWaFVxlKMHqfLRjVyE+zdCPnG3i/aPPMuPOTfmlEDCbrwZaHraEs8XRzWQttRUeZ1suo9cK8mlzF0W+FBcdkmpe7ZDmsfDDupt3jMlqHCapx1XH2NvUua9e1vqlpWVOCcm3FpLnheSkzYIVT8f+6VHEaWp7a4qvzkctGNbIuEv8G2UuYwf1nJeX7MXz95AUz0JpjUGt9X2entOUJXeXvZydJOqofdi5yk5N8LhJvksPpvwX69yE41tR6nwuMjJ8yVL4l1VX8uIx/6jKP0du3U4Qym5mSocKopY/F9S81ynWqL+ajBNe00XJArVo7wbba4qUK2oMhmNQ1Y/ehOqrai/wDLT+b/AKydtG6L0no2ydnpbT2OxFKSSn9loKEp/wAUvvSf5tnvgD53Falb0KlevVhSpU4uc5zkoxjFLltt+SS9TW94ut6J7oawWNw1acdK4mpKNnHuldVPKVxJfXyin5R79nJol3x1b3/DjX2r0refNJcZ25pS8l5q2TXv5z/lH9pFRdJ4DLaq1JYafwlpO7yN/WVGhSj6t+rfokuW35JJsCYvBDoO91bvRY5nonHGackr65qry+J3VGmn7uS5/KEjY+YBsJtnjdq9vbTTlm4V7yX6/IXcY8faK7S6pfwrhRivZL1bJAAEV+InefBbRaZVeuoX2evISWOxylw5tdviVGvu00/N+bfZerWRbx7hYXbLQl7qjMy61SXw7W2UuJ3Vdp9FOP58Nt+iTfoavdx9Z53X2r73U+obp1726l5LtClBfdpwXpGK7Jfm33bYH43A1jqHXeqLnUep8hUvb+4fHL7QpwXlCEfKMVz2S+r7ttkt+G3w353c/wCFn83VrYXSql2r9H6684fdUU+yj6Ob7c+Slw+PV8H/AIf/APaHerWGraE4aWtKvTRoPmLyNWPnHnzVOL+815v5V68bAKFK0x9jCjRp0bW0t6ajCEEoU6UIrskvJJJfkgMf260FpPb7Bxw+lMPQx9v2dSUV1Va0l+KpN95P8/L04RVPxk+IqneU7zbjQN8p28uaOYydGXaovKVClJfh9JSXn91dueer4sPE2svSutD7b3s42EuaWRzFKXDuF5OlRfpD3n+LyXy95Yd4adkFlsNd7qa8tJU9J4i3q3ttaVFw8jKlFy7r/uU49/2n28uQK7FuP0cWkHdak1Dre4o80rGhHH2kpLt8So+qo19VGMV+VQqfkbqd9kLi9qQpwncVZVZRpwUYpybbSS7Jd+yRs38JWkVo7YfTtnUpKF3fUf7Ruu3Dc63zLn6qHRH/ACgSwAABWzxnb7VNA4taL0pdKGpshR6ri4g+9hQl2TXtVl36fWK+btzFk07r64xG3eg8lqrMVYKlaUn8Gi5cSuKzT6KUfrJ/0XL8kzVRrDUOU1XqfI6jzVy7jIZCvKvXm/Ll+iXpFLhJeiSQHnfrrq5SSnWrVZcJLmUpyb/q22X38Inh3o6KtbfW2tbOFXU1aPXaWlRcrHRa82v++fq/w+S78kfeA3ZmnkrmO6WpbRTtbao4YShUj2qVYviVw0/NRfyx/e5fbpROPiK8QemtqbSeMtPhZjVNSH6rHwn8tDldp15L7q9VH70u3kn1AZjvLulpbavS8sxqG56q9RONlY0mvjXc0vuxXol25k+y/NpPW7vVulqbdXVcs3n6yp0aXMLGxpN/BtKb/DFesnwuqT7tr0SSXS1tqDWu5eXy2ss9VucnK0hCV1WUeKNpTlNQpwivKEeqXCiu7fL7vlmJ0qc6tWNKnCU5zajGMVy235JASv4XNqK+6u49Gyuac44DG9Nzlqq5XNPn5aSa/FNpr6JSfobO6NOnRowo0oRhThFRhGK4UUlwkiLvC9tnT2w2rssXcUYrM3vF5lZ+vxpJcU+faEeI+3Kk/UyzcvX2ltu9N1M9qrJws7aPKpU181W4nx9ynDzlL/RebaXcD3Mzk8fhsXc5TK3tCysbWm6le4rzUIU4rzbb8ihHiq8SVzr+VfSWi6tez0sn03Fw04Vci17rzjS9ovvLzlx91Yrv3vfq7evPUMJjbO5s8I66jY4e2bqVLio3xGVTp+/N+kV2j6cvlvwd2duKe2On8Pi9QVviayycPttza06idPG23eMIS4+/VnLlt88RUOFzzyBGnmyc9iMvgtnsRU3P1Faxv9RXlCdHTGIb4k4vmNS8qv8ABT7OEX5y+fhcfMoMRK2yG1GrN6tVTp0ridDH20YRv8pXi5wowUVGFOK/FPpSUYLhJLvwgOrTjub4htzOOqtl8rW82+YWthQ5/pTprn82/wBqT73q8PuwmlNqLGF5GEMtqWpDi4ylan3hyu8KMf8Ahx+v3n6vjhLL9pdt9LbZaYhg9M2Xwoy4lc3NTiVa6ml9+pL19eEuy9EZiBVv9I/W6Nq9PUFVa+Jm1Lo4fEkqFTvz9OV/Uqx4WrOF74g9F0aiTUcnCr3fHempTX+sUXZ8b2jrzV2xV7Ux9OVW6wtzDKKlFcucIRlGp/SE5S/ylAtqtUf3J3HwOqZUZ1oYy+p16lOD4lOmnxNL6uLfAG25eSOTDNMbqbc6iw9HKYzWeElQqQUumre06VSn9Jwm1KL+jR5eq989pdM0qk8jrvD1JwXejZ1vtVRv26aXU/6gSOfitUp0aUqtWcadOCcpSk+FFLzbfoioe4XjWx1GNW20JpWvdVPKF5lZ/Dgn7qlBuUl+cokE5XVm+O/WTljaNTMZqi5LmxsKfwrOl7daXEF+c239QLh7peKLbDRXxrSyyEtTZSnylbYxqVNS9pVn8iXv09TXsVb1rvvvLvNmf7t6Vt7vH21zzGGMwik6k4/+LV+81w+/3YceaJF2o8GFer8LIbk5xUY+bxmMkpS/KdZrhfVRT+ki12gtDaT0JiFi9J4O0xdt26/hR5nVa9ZzfMpv6tsCrey/g5UalDM7pZD4k1JT/seyqcp/StWXn9VD/mLg2NrbWNlQsrOhTt7a3pxpUaVOKjGnCK4jFJeSSSXB9gAAAHzuK1K3oVK9erClSpxc5znJKMYpcttvySRrF8U26U90tzrm/tKk/wCw8enaYqD5SdNP5qrXvN9/fhRT8izvj23XWm9Iw28w1105XN0uq/lB96Nny04/R1GnH+FS90UJAE1eErZ2rulrpXOUoTWmMTKNXIT8lXl5wt4v3lxzLjyin5NxI3230bmtfazx+lcDQ+JeXtTp6pfcpQXeVSb9IxXLf9F3aNpW1GhMLtxoaw0rg6f6i2jzWrOPE7is/v1ZfVv+iSS7JAZPb0aVvQp0KFOFKlTioQhCPEYxS4SSXkkj6AAAAAKA+Pzcj+8m4VDRGOr9WN09z9o6X2qXk0ur8+iPEfo3MvtkXdLH3DslB3SpSdFT+658Pp5+nPBp/wBQzyVXO39XMfGeSnc1JXnxk1P4zk+vq+vVzyB0C/3gh2WejdOrXeo7Tp1BlqP+6Uqi+aztZcNdvSc+zfqo8Ls3JEFeCjZyOvdYy1VnrX4mnMJVi/hzj8t3c+caf1jHtKX+VeTZsNQHIAAAAAAeRrLOWumdJ5bUV80rbG2dW6qfVQi5cfm+OP5gUG8eutZak3len7eqp2OnKCtYpPs68+J1X+f3I/5CHdrtKXeuNwcJpSz6lUyV3ClOcVz8On51J/5YKUv5HkZ/KXmbzl9mchU+JeX1xUua8/2pzk5Sf9Wy1/6OTRMbnM57X93S5jZwWNsW1yviTSnVkvZqPQvyqMC52Fx1nh8RZ4rHUY0LOzoQt6FNeUKcIqMV/RI7gAGIbxa5x+3O3eV1bkEqitKXFvQ6uHXrS7U6a/OTXL9Em/Q1Xax1FldWanyGos3cu5yN/WlWr1PJOT9EvSKXCS9Eki0n6RvWlS4z+B0HbV/1FpReRvIRfZ1Z8wpp/WMVN/8AqFaNsdI5DXmvcRpPGdrjI3CpufHKpQXzTqP6RipS/kBPvga2XhqvOf7QtSWqnhcVX6bChUj8t1cx79T94U+z9nLhfhaL6nk6O09itJ6Yx+nMJbRt8fYUI0aMF7Lzb95N8tv1bbPXAHl6p1BhdLYK5zmoMlb47HWseqtXrS4jH6L1bfkkuW32SI0308QWiNraVaxrXCzGoVH5MVazXVBvy+LPuqS8vPmXdcRaKN6713uZv7rW2x8qVxf1alR/YMPYxaoUPqk358edST8vVLsBnniP8UGb14rnTWjftGF01PmnWqt9N1fR9VJr7kH+wny1958PpWQ+Gbwr3Gep2urdy6Fa0xcuKtriO8K1yvNSrPzhB/sr5n+6vOUfDZ4XsRoedvqbW6tsxqOPFShbpddtYy9Guf8AEqL9p9k/JcpSLI3FajbW9SvXqwpUacXOpUnJRjGKXLbb8kl6gdG4rYbS+nZ1qsrTFYjG2/VJ8KnRt6UF7eSikjXd4nt5sjvPq+1wenre6Wn7W4+HjbSMG6t5Xl8qqygu/U+emMfNJv1kz2vF9v8Az3Ev56Q0ncVKelLSrzVrLmLyNSL7Sa8/hJ/di/N/M/RKYvBdsFLSlrR3C1lZpZ25p842zqx72NKS/wASSflVkn5fhT7920gyzwk7E0drsFLO56FOtq3I0lGu01KNlSfD+DF+suUnKS7NpJdly57AAAAAU4/SQ6ucbfTOh7er/iSnk7uCfouadH/3q/0RcZ9kawfFtqh6q381LdQq/EtrK4/s634fKUaC6Hx+c+t/zAjbTuKu87n8fhMfD4l3f3NO2oR95zkox/1Zty0dg7TTOlMVp6xXFtjbSla0+3moRUeX9Xxz/MoD4CtIrUW99PMXFLrtdP2s7xtrt8aX6umvz+aUl/AbEwOTxtb6lxWj9J5PU2arfBsMdbyr1mvN8eUY+8pPiKXq2j2Sov6RrWla0wWA0JaVnFX85X96k+7p0300ov6Obk/zggKobu69zO5Ou7/VWal01biXRQoRlzC2ox56KUfol6+rbfqTV4LdiqOusl/fjVlr8TTlhW6bW2qL5b6vHz596cPX0k+3kpIhnZfQl7uRuPitJ2cpUo3VTqua6XPwKEe9Sf5peXu2l6l/dx92NttgdIWWmLWMbi8sraNKxwlnNOqopdpVZeUE33cpd5NtpS7gSnqXO4TSmn7jNZ3IW2MxlnT6qtaq+mMF5JJerfkoru3wkigPih8RuR3NlPTWmoXGN0pCfM4zfFa/kn2lU4+7BPuoe/d9+EsG3i3a1vvHqGhHJymrZVVDH4iyjJ0oSk+FxHzqVHzx1Pv34XC7Fo/Cr4Y6Gl5WutNw7alc5xcVbLGS4lTsX5qdT0lV9l5R8+8uOkPB8Ifhtna1bPcHcSx6a0HGti8TWj3g/ONatF+vrGD8vN9+Eqo7lZqrqPcPUGdrScpX+Sr1/wAlKo2l/JcI24XKbt6kYc9Ti0vz4NO2TpToZK5o1YuNSnVnGUX5pptNAbJPBRppac8PmEqTpdFxlp1clW+vxJcU3/8Aw4UyajHdr7a3tNtdM2trOM6FHEWsKco+UoqjHhr8z18vksfiMbXyWVvraxsreHXWuLioqdOnH3lJ9kB2yC/Ep4h8DtZa1MNiVQzGrKkOYWnVzStOV2nXa7/VQXzP91NMiPxDeLh1qdxpzaqc4RknCvnKkHGXHk1Qg+6/jkufZLtIj3w3eHnP7o5KGq9Xyu7LTEqrq1K9Vv7RkpN8tQb79LfnUf8ALl8tBCWstT53WGorrUGo8jWyGRupdVSrUfp6Ril2jFeSiuEjKfD7txdbo7m4/TVPrp2Kf2jJV4/8K2g11tP9p8qK+skYlq77G9V5b+zrWNpZfba32ehFtqlT630xTbbfC4Xd8l6v0e+i6eF2qu9XXFFK8z901Tm13VtRbhFfTmfxH9fl9gLHYjHWWIxVri8bbU7WytKMaNvRpriNOEVxGK+iSPpkLu1x9jXvr64pW1rb05Va1arJRhThFcylJvskkueT45vK43CYm5y2XvrexsLWm6le4r1FCFOK9W2UG8VviNr7h/F0jo6de00rCX6+tJOFTItPlNrzjSTXKi+77N8dkgxTxTbvXO7mvadLFKstPY6UqGKodL6q8pNKVaUfPqnwuF6RSXm3zczwkbVPbDbOnDJUYw1Bl3G6yXvS7fq6PP7ib5/elL04Ia8EuwcqcrTc/WVnxLhVcHZVY+XtczT/AOhP+L9llyQBQHx/bhT1DuVR0XZVucdp6H65Rfapd1Ipzf16Y9Mfo+v3L+V5qlSlUl5RTk/5dzT/AKsylxndUZTM3VSVSvf3lW5qSk+7lObk/wD3Azrwz7ZVd0t0bPC1lKOJtV9rylRPjihFrmCf7U21Fe3LfobQ7K2t7Kzo2dpRp0LehTjTpUqcemMIRXCikvJJJLgrp+j/ANER0/tJW1TcUum91FcOpGTXdW9JuFNfzl8SX1UkT3qzUeE0pgLrO6iyVvjsdax6qtetLhL2SXnKT8lFctvskB9tRZnF6ewd5m81e0rLH2VKVa4r1XxGEV6/V+iS7ttJdzWjvluBmd8d26dXF2NzOjOpGwwlgu8+hy7cpduucn1P27LniPJ7vii3+yO6+RWFwsLjH6UtanVSt5vipeTXlUqpe34Yd+PN8vyn7wXbBVdHW9LcDWFs4Z+6otY+yqR+axpSXec+fKrJduPwxbT7tpBMPh825t9r9sMdpqDp1L583ORrQ8qtzNLra90klBfSKJCAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABjW5misJuDovIaVz9Fzs7yHCnDjro1F3hUg35Si+/9U+U2jJQBrH1jpDcbw4boWeVoTlF29Vyx2Up027a9p+sJL0bXKlTb5XpyuJFw9nfE9t3rext7bNZCjpfOOKVW1v6nRQnL3p1n8rX0l0y9OH5kz5zEYvOYytjMzjrXI2NddNW3uaUalOa+sZLggfWfhD2rzlapc4pZXT1WfdQs66nRT9+iopf0TSAnrGZTG5SnKpjMhaXsINKUretGolz5cuLZ3CF/D94fcNtDnshmbHUWTylxeW32Z06sI0qUYdSly4x+9LmK4bfZN+5NAAAAAAAAAAAAAAABgu5+7egNuLaU9U6gt6F109VOxov4tzU9uKce6T95cL6lTd0PGHq3O1qmL27xEcJb1JdFO6rwVe8qc9l0x7wg37cTfswLo6v1bpnSGNlkdT52wxNqk+J3VZQc+PSK85P6RTZWvc/xnacxyqWe3+ErZq4XKV7fJ0LZezjD/Emvo+giHRnh13l3Wya1DrG7ucTRuGnO9zc51Lqcf3aLfV+Sl0L2LMbX+FrbDRjpXeQsZ6oyUOH8fJpSpRf7tFfJ/wA3U/qBTTcjXu8W5WAvNTahu8lLTVGtGnKNCLt7CE5PiMIx5SqS/Pqlx5kUssR45Nyaep9wIaKwlSEcDppyouFHhU6l35VGku3EPuL2an7leaNOpWqwpUoSnUnJRjGK5cm/JICYPCLtnLcfdm0jeUPiYPDuN9kXKPMZqL/V0X79clw1+yp+xsyhCMIKEYqMUuEkuEiJ/CvtfHa/a+2sLylBZzItXeUmu7VRr5aXPtCPb26nJrzJaA4b4Rq18Teup7gbyZzMwqudhQquyx655SoUm4xa/ifVP/ObJt1MjWxG2ep8rbNqtZ4i6r02vNSjRk0/6o1HN8sCyvgI20p6p3Br60yluqmM064yt4zjzGreS5cPz6EnP6ScDYCRX4UdHUtF7GaesvhKF3fUFkbx8d5VayUu/wBVDoj/AJT478786O2psZ29zWjldQyhzQxNvUXX38pVZd1Tj+fd+iffgPW363WwW0+i6mZyco3GQrqVPG2ClxO6q8f6QjynKXouF3bSev8A0HpvV3iC3mrO6uJVLrIVnd5W+6fktaKaTaXokumEI/kvLlnVzWV3C8QG6lLqpyyWYvX8O2tqKcaFpRT54XP3KceW3J/Vtts2B+HraPD7SaMWLtJRu8rd9NXJ3/Tw69RLtGPqoR5aivq35tgZtpHT+L0rpnH6dwtsrbH4+hGhQpru1Ferfq2+W36ttnqgACHPFbu/R2q0C/sFSEtSZVSo4ym+H8LhfPXkvaHK4XrJxXlzxLOXyFnisXdZPIXELeztKM69erN8RpwinKUn+STNV2/O4l9uduTkdTXLqQtZS+Dj6En/AIFtFvoj+b5cn+9JgYRdXFe6uqt1c1qlavWm6lSpUk5SnJvlybfm23zyX08DWzL0lp3+/wDqK0Uc5lqKVjSqR+a0tZd+ePSdTs36qPC7cyRAfgw2gW4uu3nc1a/E01g5xqV4zj8t1X84UfqvxS+iSf3jYykkkl5IDk+dxVpUKFSvWqQp0qcXOc5ySjGKXLbb8kvc83Vuo8HpPAXOe1Fk7fG421j1Va9aXCXskvOUn5KK5bfZIoB4mfEhmNyatbT2m3cYnScXxKm301r7j8VXjyh7U0+PV8vhIPJ8Xm7ctztxJ2+LuOrTeGc7fH9L+WvLn9ZX/wAzSS/dS8m2eV4Zdob3drXSsqjq2+BsOmtlLqHnGDfy0ov9ufDS9kpPvxw4st6NW5uKdCjB1KtWahCK85Sb4S/qXk09uDt74Y9rLbSMqlPO61mvtOTsbKon03UkuY1avdQUElFLvLtz09+QLHXV1pTbrRUJ3VeywOn8VQjTi5vpp0oJcKK9W36Jctt+rZRzxO+Jq+3At6+lNGRucZpmXMbmvP5bi/Xs0vuU/wB3zl68L5SMN2N0dc7wakoyzFerXi6vRj8VZwl8GlKT4ShBcuU3zx1PmT8vLsWW8MfhVp46dtq3dC0p17tcVLTCS4lCk/NSr+kpf+H5L8XPkgwXwq+Gi51hK11lr23q2unuVUtLCScamQXmpS9Y0n/WXpwu7s74qrqjp7w2arhZU4W1FY+FlRp0odMYQqThS6Ul2S6ZcfQlmMVGKjFJJLhJehCfjgjVfht1H8Lq7VLRy4/Z+00+QNeW32Dqam11gtPU4uTyOQo2z49Izmk3/JNs27W9KnQoU6FGChTpxUIRXkklwl/Q1i+EChb3HiQ0dTuY9UFc1Zpc8fNGhUlH/qSNnq8gOTGtyNcac2+0rc6k1PfxtbOiuIxXepXn6U6cfxTft+bfCTaxne/enRu1GKdTM3au8vUg5WuKt5J16vs5f93Dn8UvZ8JvsUN1XqTcrxG7mW1rStp3dxNuNjj7flW1jS5XVJt+S8nKpLu+30QHV8Qe82oN3dSRur2LscNaSksfjYT5jST85yf4qj9X6eS49cM0BhrHUGscZiMpl7XD4+vWX2q+uaihChSScpy5fr0p8L1fC9S3mf8AB1a0NnFYYe/o3WuKdZXU7yq3CjWXS07aH7Me/Kk1y5Lvwn2rBkNnt07HIfYa+32pfjdbgvh46pUjJr2lFOLX1T4AnndnxUW2JwFHQ2y1k8di7K3jaU8tWp8T+HFdK+BTf3ey+/P5u7+VPuQhs/tjrHeTWFW2xrqTj8T4uTyt25ShR6ny5Tk+85y78R55b9ly1LWzXhC1bqCvSyOv6z03jOU3aQlGd5WXtwuY019Zcv8AdLt6D0fp3Q2nKGn9L4yjj7Cj3UId5Tl6znJ95SfHdsCnvi70Xhdo9jtL6F0zSn8LI5Odzkr2aXxbypRp8Jza9OanKj5Lp9+W4Y8K+MweT3007/eO/srLG2daV7Und1o06cpUoucI8yaXeaj29kzYRvztfid2dCVdN5GvKzr06quLG8hDqdvWSaT45XVFptOPK5T9Gk1SvLeEHd60yMrezo4XIUE/luaV+oRa93GaUl/R/wAwJ+3n8W+jdLQr4zRMIaoy8eYqvFuNjSl7ua71fyh2f7SKnWttun4iNxG3K4zOQl2nVn+rtbCk39PlpwXsu8n+0yc9tPBXdzr07vcLUtGnSjLl2OJ5lKa9nVmko/kov80W10Lo/TWiMDSwelsRb4yxp9+ikvmnL9qcn3nL6ttgRz4eNgNMbT2av5OOX1NVhxWyVSnx8JNd4UY/gj7v70vXt2VHvFdPPVPEBq2WoKdWncfbpK3Ul2+zJJUHH6Omov8APn1Nopi2utvdE64jS/vXpnHZadGLjSqV6X6yCfopriSX05A1u+H7Z7UG7WqVY2MZ2mHtpJ5HJShzChF/hj+1UfpH+b4Rsr2/0fgNCaVtNNabsY2lhbR7LznUm/vVJy/FN+r/APZJI7OkdM4DSWEpYXTeJtcXj6TbjQt4dK5fnJ+spP1b5bPXAAAD8zjGcXGSUotcNNdmirO8Xg8wOoMlcZjQmWhp+4ryc54+vSc7Tqfn0OPzU1z6cSS9El2LUADXfeeD7d6hcOnS/u/cw9KsL9pf0lBP/QyDTfgq1xdyhLPapwWMpyXMlbRqXM4/TjiEf+ovgAK77f8AhE2w09Onc5x3+p7qD54u6nwqHP0pw45/KUpInrCYjFYPHU8bhsbZ46ypf4dva0Y0qcfyjFJHeAAAAAAAMf3F1ZitDaKymqs1U6LPH0HUlFPiVSXlGnH96Umor6syAoX4991v7xasp7eYa56sXhKnXfyg+1a8446fqqabX8UpeyAr3uHqzLa41nlNVZur13uQrupNL7tOPlGEf3YxSivojwUm3wly2cFnfAxs2tWak/2gahterCYeslY0qkflurpd0/rCn2f1l0rvxJATx4L9m3t3o2Wo89a/D1Pm6UZVITj81nb+caPupPtKX16V+HvYI4OQAAAAAARxr3Y7a3XGVlltQ6Sta2QqSUqtzQqToVKr44+d05Lq/N8vsSOAPI0jprBaSwFvgdOYy3xuNt0/h0KK7Jt8ttvu235tttnrgAAAAAAAr14+dU/2FsbPD0qnTcZ29pWnCff4UH8Wb/L5Ixf8RYUol+kd1BK73B07pyFTmnjsdK5nFPyqVptf/bSj/UCqvqbS/DDo/wDuRsjpzD1aKpXlW2V5eLjh/GrfO0/rFOMf8pru2B0n/fbeLTOnJ0/iW9xfRqXMfR0afNSp/WMWv5m1yKSiklwvRAcnD8jkAayfGZdXFz4j9VK4m5fBqUKVNNccQVCnwv8AUlH9G/pijeaw1LqyvBSnjbSlaW/K54lXlJykvZqNLj8pszPxl+HvOayzq19oe2je5GdGNLJY/rUZ1ehcRq022k30pRceeX0rjl8lV7HTW7+mal3irDB62xMrtKNzb21tc0vjpc8KSiuJLu+PPzYGxbc3enbfbylVjqDUls76C7Y+0ar3Lft0R+7+c3FfUqLvN4utXaopV8Voi2lpjGzTi7nr672pH6SXalz+7y1+0YRoTw3bvavuYS/u3Ww1tOXz3WXbt0vr0P8AWS/lFlqdnPCZofR9ajlNU1P715Wm1KMK9Los6cvpS79b+s21+6gKrbJ7Ba83YvY5N06mLwdWo5V8vfRb+Ly/mdOL71ZefflLnzki/Ozu0+jtrMJ9g01Yf7zVild5CvxK4uX+9LjtH2iuEvbnlmdUqcKVONOnCMIRSjGMVwkl5JI5bSTbaSXmwEmoxcpNJLu2yjHjH8RNPUkbnb3Ql71YdS6MpkaUu140/wDCpv8A7pPzl+PyXy/e7Pi/8SKzMbvb/b6+/wCzHzSymUoy/wDivR0aTX/D9JSX3/JfLy5dPwceHhamqWu4OubN/wBi05KpjMfVj2vZJ9qtRP8A4Sfkvxvz+X7wez4MPDy68rDczW9q1Si1Ww2Nqw++/wANxUT9PWEfXtLy45ukcJJJJdkjkAAAAAA8rWGXpaf0pls7X4+FjrKtdS59qcHL/wDQ1CX9zWvb2td3E3OtXqSqVJPzcpNtv+rNmnjCyzw/h11XWhJqdxQp2keH5/Fqwg/+lyNY33p9kBfb9HZpd4za3LamrU+mrmsh0U5ftUaC6U/+eVX+hZ8wzY/TcdJbR6X0/wDDVOpa42l8ZL/vZLrqf9cpGZgCjv6SDT2UjrDTmqfhVJ4upj3YfEUPlp1oVJz6W/RyjPlc+fS/YvEdLN4nGZvGV8XmMfa5Cxrx6atvc0lUpzX1i+wGp7b7X2qNBVcjcaVv1jrvIW32WrcxpRlWhT6lJqEmm4NtLuu/Zex29A6D13urqWpQwOPvMtd1qnXd31eT+HTcny51asuyb7vu236JmwVeGrZRZJ3/APce2c2+fh/aq/wk/wCDr4/l5En4LD4nA4yljMJjbTG2VL/Dt7WjGnTj+UYpICGPDp4cNObXulnMrUp5zVPT/wDFyhxRtOV3VGL78+nW+7Xko8tOdgAODXH4ytpsnoXci/1HZ2dSppvOXErqhcQi3ChWm3KpRm/wvqbcfeL7d0+Njp18jZWeRsqtlkLShd2tVdNSjXpqcJr2cXymvzAoBoDxcav0jtvYaUp6dxmRu8dRVva5C5rT4+FHtCM6ceOppduVJdku3q8D1NrLd/fjPU8dUlks5Lq6qWMsKLjbUfPiThH5Vx3+ebb+pfqtsPs9WuZXE9vcH8SUup9NFxjz/Cnx/oZtp3AYPTtgrDAYewxdqu/wbS3jShz7tRS5YFWNgfCJa42tb6g3RnRvrqElOlhqM+qhBry+NP8A4j/cj8vbu5J8FtqNKlQoQo0acKdKnFRhCC4jFLySS8kfQAaqPEJojIaA3ZzmEvaVRUJ3M7mxrSXatb1JOUJJ+vrF/WLRN+y/iswm32zWL0lW0pkchlsZGpCnKFeFO3qqVSU03J8yi/m44UX5efct9uPt5o7cPFRxursHb5KlT5dGpLmNWi35uFSPEo+nk+HwueSHZ+DjaWV58dXGpY0+f8BX0Oj+rp9X+oFQt2939wN4sxRtcnWqO0lVSs8Nj4S+EpvsuILmVSf1fL7vjhdiwfhk8Ks7W4t9W7pWdKUopVLPBz+ZRfmp3Ho+P+77/vesSxm2+0e3m3r+LpXTNpaXTXErupzWuGvVfEm3JJ+y4RnQHEIxhFRikopcJJdkcgAfivTVWjOlLnpnFxfHs+xqV3W0fkdBbgZfTGSo1KdSyuJRoymv8Wi3zTqJ+qlHh/1XobbTC9zdrtC7j21Klq7AUL6rRi40bmMnTr0k/SNSLT4+j5X0AqjofxcYzRuz2B0xjNH3N1m8bZxtZzrV4wtfl7KomuZy57Nx4j3b7kLbgbg7lb36ptrW9dzkq86nFjicfRl8Kk3+xTXLb95ybfHrwW6peDPamF0qsshqipTUuXSleUlFr25VLnj+ZMm3W2+idvrF2uktP2mO6lxUrJOdar/FUlzKX5c8AQL4X/C7R0nd2msdwo0bvOUpKrZ42LU6NnJd1Ob8p1F6cfLF9+74atOAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABhG6W6uhdtbD7RqrOUbevKPVRsqX6y5rfw01349Op8R92U73V8VOv8AXd89P7eWF1gbS4l8Ol9lTq5G459FKP3OfaC5X7TAtruxvTt7tpRnDUWbhPIqPMMbZ8VbqXtzBPiCfvNxRUrc3xVbi68vP7v7e4yvgaFzL4dNWadfIV/opJfJz7QXK/aOztR4RtY6qrRzW4uSq4G2ry+JO35Va/rc925N8xpt+8uqXvEt7thtbobbew+zaUwdC1qyj01byp+sua38VR9+PouF7ICne2PhK1/q+7Wa3ByMtP21efxKsasvtF/W57ttc8Qb95NtesS3W12z23u29CH92dP0IXqjxPIXK+NdT9/1j7xT9o9K+hn4AET+KbdCG1+1t3f2laMc5kObPFQ7cqq181Xj2hH5vbnpT8yVLirSt6FSvWqQpUqcXOc5viMYpctt+iSNY3in3Snujudc31pVm8Fjk7TFQfKTpp/NV495vv78KK9AInq1J1as6tWcp1JycpSk+XJvzbfqyxvgT2uer9wpaxytt14XT04zp9a+WtePvTj9ehfO/Z9HuQFpfCZLUuosfgMPbu4v8hcQt7emvWUnwuX6Jebfok2bVNm9B47bfbzF6Tx3TP7LT6rmuo8O4ry71Kj/ADfl7JJegGYHIAHnalxNtn9O5LB3vV9myFpVta3S+H0VIOMuP5M1Q7naF1Bt5q6705qKyqUK9Cb+FVcX8O4p8tRqU3+KLX9O6fDTRtvPJ1NprT+p7H7DqLCY/K23find28aqXPqupdn9UBr2y/ip3QudFY/TOMrWGFVraQtql9aUn9prKMVFPqk2oNpLlxSfPk15GK7U7Q7h7vZid1jLSvK1q1XK7zF/KSoqTfzNzfLqT+keX78eZsGx2yO0lhdfabbb3T/xfepaKol+Slyl/JGfWtvQtbeFvbUadGjTXTCnTioxivZJdkgI42G2Z0vtJg5W+Ki73LXMUr7J1oJVK3HfpivwQT8or+bb7kmAAAABW/x/62q6d2lt9NWdb4d1qO5dGpw+H9mpcTqcfnJ04/k5FCNPYm/1Bn7DCYyi699f3ELe3pr8U5yUV/qy1n6Sm3vlqDRt1Pl2ErS5p0+3aNVTg5d/rFw/oRD4R9QaJ0nu/R1LrnI/YbPH2VeraVHQnVTuGlGK4gm/uyqNdvNIDYZtFobF7c6AxmlMVGLha007islw7iu+9So/q3/RJL0PA3x3p0dtPinPMXP2zL1YOVpirea+PV9nL/u4c/ifs+FJrgrjvJ4yL68p18VtnjZY+m+Y/wBq30FKtx706XeMfzl1fkmRXs/stuFvdnamevri5oYyvWcrzO5ByqOtLnuqfL5qy9PPpXHdryA87XOtty/ELr61x9O3r3lSdRrHYiz5+BbR9ZPntzx96pL/AEXCVo9AeEzAYja3M4vN3Fve6ty9jKisg6fXSx83w4qin37SS6p9pNcpdKbTl/ZvabR+1eEdhpuybuqyX2vIV+JXFy1+1LjtFekVwl+fLeegam9dbX690Tma2Nz2mclQnTm1CvToSqUKyX4oVEuJL19/dJmRbX7A7nbhXNOdjga+Nx83zPI5OMqFHj3jyuqf+VP68G0FoAQ7sJ4e9G7V06eRjH+2dR9LU8nc00vh8rhqjDuqa47c8uT5ffh8ExgADEd5NJvXO12odKQlGNbIWU4UJSfEVWXzU2/p1xjz9DLgBqU0plc9tduhY5Wtj50Mvgb9SrWdwnF8xfE6cvblNrn68k67j+MrWebsaljpHCWmmoVI9MrqdX7VcL+FuMYR/wCVv2aLia72t2+1zcQudVaUx2TuYR6VcTg4Vun0XXBqTX0bPK0vsZtLpu8V5itC4mNwpdUalxCVw4P3j8Vy6f5AUW2p2O3L3jzUs3e/arTH3NXrus3lOqTq8+bgpfNVl+Xb3aL7bObV6T2s09/ZWm7RutV4d3fVuJV7qS9ZS9EvSK4S/NtvOYpRSSSSXZI5AHByAODkAAAAAAAAAAAAAAAAAAAAAAAAAAAfirUhSpTq1ZxhThFylKT4UUvNt+wEX+J7dCltbtjdZS3qU3mr1u0xVKXD/XNd6jXrGC+Z+nPSvxGsC7r1rq5q3NxVnWrVZudSpOXMpyb5bb9W33Ja8V+6b3Q3NrXNhVk8Di1K0xke/E48/PW495tc/wAKgvQiaytbi9vKNnZ0Kle4r1I06VKnHqlOcnwopLzbb4Ay/ZTbvLbn7gWOl8WpU6dR/Fvbnp5jbW8Wuuo/r3SS9ZNL1NpmkNPYnSmmcfpzB2sbXHWFFUaFNeiXq36yb5bfq22Rl4VNoKO1Og1G/hTnqPKKNbJ1Yvn4fC+ShF/sw5fL9ZNvy4JjAAAAAAAAAAAAAAAAAAADh+TNZXjJzDzPiI1PPn5LSpSs4fRU6cU/+rqNmr8jU1vbeSyG8OsLuSknUzd32lLlrirJef8AICdf0cmn1e7k5/UdSmpQxeNjQg2vu1K8+zX+WnNfzL4lW/0cWKjb7YagzDpyjUvcv8HqflKFKlDjj+dSZaQAAAAAA4OQdHPZfGYHD3WYzN9QsMfaU3Ur3FeajCnFerf/AOnq+wHbrVadGjOtWqQp06cXKc5viMUu7bb8kUi8W3iXp522utCbc30njKidLJ5Wm2vtK8nRovz+H+1L8Xkvl5csZ8UfiVvdwY19KaNlcY7S/LjcVpfJWyH8S84Uv3fN/i/ZWR+Efw1SzjtNebh2UoYvlVcbiq0eHd+qq1U/Kn6qP4/N/L2kHn+Erw21NXO11xry1nS0+mqljj5pxlf+05+qo+y85/w/evhQpU6FGFGjThTp04qMIRXEYpdkkl5I5hCMIKEIqMYrhJLhJH6AAAAAAAAArf8ApDbqvb7HWdGlJKFzm6FOqmueUqdWa49u8UUV2+x0cxrzAYmXPTe5O2tnx+/VjH/9S+3j+xzvdgal0oOX2DKW1w2nx0p9VPn6/wCIv6lE9p7qFlujpS7qzUIUM1Z1JSflFRrwbYG2+MVGKivJeRyAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHyuq9C1tqlzc1qdChSi51KlSSjGEV3bbfZJe5V3fPxd4HASr4XbmjQz2SjzCWSq8/Y6L/cS4dV/VcR8u8vICxetdXaa0XhamY1TmrTFWUOf1lefDm/2YRXzTl9Ipsp9vR4wsrlHUwu11hVx9Kb6P7UuqalcT57fqqXdQ/OXU+/lFkd6O223i8ROof7y5m8uHYTk4yy+S5jQhHnvChTXHVx3+WCUefNouNsn4f9B7X06V5Z2n9r52K+bKXsFKpF+vwo+VJfl83vJgVU2t8Mu5O5eTepdeXt5g7O6n8WtcZDqqX9zz6qEnyufebXpwmXM2q2m0LtpYqhpbC0qNzKPTWv636y6re/VUfdL92PEfoZ0AAAAAGPbjatxWhdFZTVWaqdNnj6LqOKfzVJeUKcf3pSaivqwID8eW68dMaOjt/h7npy+dpc3koPvQs+WmvzqNOP8ACp+6KDN8s9/cXVuX1zrPJ6pzdXrvb+s6kkvu04+Uacf3YxSivyPb2I26v90NyMfpe0c6VtJ/Gv7iK/wLeLXXL83yor96SAsl+j42scVc7pZm24b67TCqa9PKtWX+tNP/AMz6Fyjo6fxOPwOEssNiraFrY2VCFC3ow8oQiuEv9PP1O8AAAAAAAAAAAAAAYdu5txpnc/Sk9Pamt6kqSn8W3r0ZdNa3qJNKcHw1zw2mmmn6orDk/A/V+1yeM3Dgrd+SuMW3NL841OH/AERc8AVt2y8H+gNNXlO/1Ne3Wq7mnLqhSr01QtefTmnFty/KUuH6osbaW9vaW1K1taFKhQpRUKdKnBRjCK7JJLskvY+oAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABWvx4bpvSWg4aJxFz0ZjUNOSruD+ajZ+U39HUfyL6KfsiwOqc5jdNacyGfzFzG2x9hQnXuKj9IxXL4Xq35JeraRqo3e1xktxdwcpqvJuUZXdX9RRb5VCjHtTpr8o8c+75fqBiRcDwD7PK7uf8AanqG05oUJSp4OlUj2nUXadxx7R7xj9ep/hTIG8O22F5uruPa4GDnSxlBfacncR/4VBNcpP8Aak+Ir6vnyTNomGxtjh8TaYrGWtO0srSjGjb0aa4jThFcRivySA7gAAAAAAAAAAAAAAAAAAAAAalN5bepabuavtqvHXTzd4nw+3+NNm2s1peNXS9TTXiAzdX4bjbZdQyVB8dpfEXE/wD6kZgWi/R8XFGtsNVp02+uhmrmFTlcd3ClJfn2aLFlMf0buq6MKmp9FV6yjVqOnkrSDf3uF8Orx9f8L/UucAAAAHDfC5ZXPfzxUaX0R9owmj1Q1HqCPMZTjPmztZfvzT/WSX7MX+ck+wEv7pbi6U2105PN6qyMbam+VQoQ+avczX4KcPxP69kvVpGvfxAb56p3hy1OxVGpjsFSqr7HiqE3Nzn5KdRr/Eqd+F24XPCXdt4ze3u4m9u4VONSV7qLPXj6aVOKShShz5Jdo06a57vsl5vuXb8NPhtwu2saOodRyt8xqtrmFRR5oWP0pJ+cveo0n6JLvyEfeFrwuRtJWms9zrLquYtVbHCVVzGn6xncL1l6qn5L8XL5irgrsuDkAAAAAAAAAAABi+62k6Gutuc7pOvKMFkrOdKnOS5VOr96nP8AyzUX/I1Q5zGZTTmoLvE5O3q2WSx9xKlWpy7Sp1Iv/wDyuU/XszcMQ5v54fNH7r1P7Urzq4bUEKahHI20FL4qX3VVg+FNL0fKklwueFwB9Nid8dHa60DYXmQ1Djcfm7e3jDJ2l3cwozjViuJTSk1zCTXUmueOeH3TPH3Z8Um22i7WtQw99DVWXimoW2Pqc0VL9+v3il/D1P6EBX/gq3Bp3jhY6m03cW/pUqyrU5P84qEv/cz/AG28F+Gsbune681FPLqHD+w2EHQpN+0qjfXJfko/mB6fhH3M3d3T1/ms9n5W8NH0rd0o0adtGnSpXHVFwhSlx1yko9TlzJ9mufOJaI6GAw+KwGIt8RhMfbY+wtodFG3t6ahCC+iX9efU74AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADz9QZrE6fw9xl85kbbHWFtHqrXFxUUIQX5v19l5v0A9Ai7e3fPQ+1dpOllbz7fmpQ6qOJtJKVaXPk5vypx+su/spFc9/PFzkMlOvgNrFUsrR8wnmKtPivV9P1MH/hr95/N7KLPC2S8Lerte3UdT7i3V7hsbcy+NKFZuWQvOe7k+rn4af7U+ZP278gYxrTcXd7xG6nWncNY3P2CUlKnh8fJqhTjz2nXqPhS47fNNqKfklyWD2N8JGmtNKhmNwKlHUWWXEo2UU/sVB/VPh1X/FxH91+ZPegNEaW0HgoYbSmHtsbaLhz+GuZ1ZftTm/mnL6tmRgfO3o0behToUKUKVKnFRhCEVGMYrySS7JH0AAAAAAABQfx5btR1Rqunt/g7nrxODquV9OD+WvecNOP1VNNx/ic/ZMsl4td26e1+3VSGOrxWpMupW+Nj5ul2+eu17QTXH7zj5rk1oVJzqVJVKkpTnJtylJ8tt+rYHCXL4Nj/AIM9ppbc7df2pl7b4eos6oV7pSXzW9HjmnR+jSblL6y4f3UVp8EG0a1zrl6tzVsp6fwNWM1CceY3N15wh9Yx7Tl/lXlJmwwDkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4fkBTb9IZua4qx2vxVx95Qvsu4v+dGi/8A8jX/AJZTWjSqV60KNKEqlSpJRhCK5cm3wkl6snfxu6J1Dg968vqK8tLipic1OFe0vOlum+KcYypuXkpRcX2fpwzpeC3SV9qHffCX6w0r7GYmc7q8rTj+qoNQl8OTfl1dfS4x821z5JgXL8KW1ENrdtqVC+pQWocp03OUmuG4S4+Sin7QTa/icn5NEvnByAAAAAAAAAAAAAAAAAAAAAACDfGHtBW3Q0HSvMJSjLUmFc61nDy+005JfEoc+74Tjz6rjt1Nk5ADUZobU+oNu9c2eoMS52eVxddqVKtBrnjmM6VSPZ8Ncxa7P8mbENnvEXt3uBjKEa2XtcBmnFKtjshWVNqXr8OpLiNRe3HfjzSOvvr4cdFboXU8wpVMFqCS4nf2tNSjX7cL4tN8KbX7Sal7tpJFYNU+DzdPGVpvD18LnKCTcHSufg1H7cxqJJN/ST/MC+mR1Lp3G2VO+yOexVna1Y9VOtXvKdOE17qTfDX5EQbi+KjanSlKrSx+Tqamv4pqNDGR6qfPpzWlxDj6xcn9Co1r4YN8LmrCnPSCox8lKtkbdRj/AEmyRNG+CrVt66dXVeqcXiqT7ypWdOV1V49uX0RT/JsCPN5/EnuDuKq+PpXX938FUTi7CwqNOpH2q1e0p/VLiL9j97HeG/XW5To5K4ovT+npvn7fd031VY/+DT7Of5viP1fkXG2u8Nm12hKtO8p4iWcydN8xvMq1WcH7xp8KEfo+lte5MaSS4S4QGC7PbU6P2twjx+mbDivVS+1X9fiVxctftS47L2iuEvbnlmdgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHyua9C1tqlzc1qdGhSg51KlSSjGEUuW232SS9Sn3iJ8W0aErjTe1VWFSaThXzk4cxi/VW8X2f8cu3sn2kBNu++/OjNqLaVte1XlM/OHVRxVtNdffylVl3VOP1fLfomUyzGb3g8T2tYWFrbyq2tvLqhaUeaVhYRfbrqSfPzcc/M+ZPuor0Mn2H8NGqNzLmOsdwL6/xmHu5/H6qsnK+yHPfr5nz0Rfn1y5b9Fw+S8WhtIac0Rp+jgtL4m3xthS79FJd5y9ZTk+85P3bbAibYLw1aR23VDMZZU9QamjxJXdan+ptpf8Agwfk1+3LmXbt088E7AAAAAAAAAADz9R5nHaewN9nMvdQtbCxoTr3FWXlCEVy39X7Lzb7HfKRePfeFZLIf7LtP3XVaWdSNTNVYPtUrLvCh9VDtKX73C7OLAr9vjuLk90NxL/VF/10qM38Kxtm+VbW8W+iH593Jv1lKTPC0JpfLa01djdMYOg61/kK6pU136YrzlOXtGKTk37JniF+/Ars+9J6Wlr7PWvRms1RSs6c181taPhp/SVTtJ+0VHy5aAnPavROJ280JjdKYaC+BZ0uKlVx4lXqvvOrL6yfL+i4XkkZSAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHzuKFG4pOlXpQqwl5xnFST/AJM/FlZ2llR+DZ21G3pc89FKmoR/oj7gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4OQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABi25mv9LbdabqZ3VWShaW65jSpr5qtxPj7lOHnKX+i820u5gXiG8QOl9qLaeOp9OY1PUhzRx1KfCo8rtOtJfcXqo/efbsk+VT7Tund1vE7r6tlLy5c7ei+ivfVouNnYQ8/hU4r19oru/OT82B3N4N6Nwd+dR0tJaYx17bYm4qdNthrNuVS5afKnXkuOrjz47Qjxz346ifvDp4VsPpF2+o9fxtsznY8To2XHXa2b9G+f8Wa938qfknwpEr7I7O6R2owztsHbfaMlWgleZOvFOvXft+5Dnygu3lzy+5IwHC7HIAAAAAAAAAAA8vVmfxWl9N3+oc3dRtcdYUJVq9WXpFeiXq2+El5ttL1AjXxT7uUNqtvp1rOpTlqLJqVDF0nw+mXHzVmv2YJp/WTivJvjWXeXFe7uqt1dVqlavWnKpUqVJOUpyb5cm35tt88mbb6bk5TdLcG81LkFKjQf6mxtXLlW1vFvph9X3cpP1k36cHhbfaTzGuNYY7S+CofGvr+qqcOfuwj5ynJ+kYpNt+yAlrwcbPf7StdPL5m3ctM4Wcal0pL5bqt5wofVduqX7vb8SZsejFRioxSSS4SXoYltFoPEbb6Dx+lcPHqp28eqvXceJXFaX36svq36eiSXoZcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA+F/d2thZVr2+uaNra0KbqVq1aahCnBLlylJ9kkvVgfYq14nPFHYaZhc6U25uqF/ne9O5ycUp0LJ+TUPSpUX84x9eXylHPih8T91qf7To/bi5r2mFlzSu8nFOFa9Xk4U/WFN+r+9Ly7LlP2/C94WZVna6w3QsXGkuKtlg6q7z9VO4Xov/D9fxesWGAeHnw+6n3cy398NZXN9Z6er1nWq3daTd1kpN8y+G5d+G+eaj5+nL54v5pXT2F0rgbXBaextDHY21h0UaFGPCXu36tvzbfLb7tno0adOjShSpQjTpwioxjFcKKXkkvRH7AAAAAAAAAAAAAABQ3x1byx1Nnnt1py76sPiq3OSrU5fLdXUe3R9YU+/5z5/ZTJx8ZO9UdudJvTeBu1HVWXotU5QfzWVu+VKs/aT7xh9eX+Hh66pNyk5Ntt+fIHBsH8EuzE9CaXlrHUVr8PUWZor4dKa+aztXw1Br0nPtKXslFdmmQf4Idl/756kWutRWqnp/EVl9lo1I/LeXS7rt6wh2b9G+F3XUi/4HIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHha71bgdEaXvNSakv4WWPtY8yk+8py9IQXnKTfZJAdzUmcxGm8Hd5vO5Chj8daU3Ur3FaXEYL/9W/JJd22kuWygfiQ35zu8eZo6M0XaX9HT068adG0pwbuMnV5+VzjHn5eeOmn37/M+/Cj4e9G6utPEDrmxwGEx11DHOv0YrDUZdUpz7/rar8nPjl8v5YR5/ek7Z+F/w+4vaywjm8z8DI6uuKfFS4S5p2cWu9Ojz6+jn5vyXC55DGvC34Z7HRcbbV2uqFC/1LwqltZySnRxz80/adVfteUX5ctdRZsAAAAAAAAAAAAAAAGG7ybhYbbLQd9qjMSU/hL4dpbKXErqu0+inH8+OW/RJv0Moy+RscRi7rKZO6pWllaUpVq9erLphThFcuTfskaz/FDvBd7sa5de2lVo6dx7lSxdtLs3F/erTX7c+F29EkvdsI911qnM601ZkNT5+6dxkL+q6lWXlGK8owivSMUlFL0SRkexG2eW3U19a6dx/XRtI8VshedPMbagn80vrJ+UV6t+ybWI6cw2T1FnbLB4a0qXmQvq0aNvRh5znJ9vyXu32S5bNnXhy2nx202gqWJpulcZe76a2UvIr/Fq8doxb79EOWo/zfCcmBm+kNPYnSmmrDTuCtI2mOsKKpUKUfRLzbfrJvlt+rbZ6wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA8TXGqsHovS97qTUV9Czx1nDqqTl3cn6RivxSb7JLzYH417q7AaH0vd6k1Jfws8fax5lJ95Tl+GEI/ik/JJGvHd/cjWniH3FscNhsZc/ZPiuniMPRl1NN+dWo/Lq47uT+WEV7ct/PePcjWHiD3IssViMfc/ZHWdHDYelLqab86lR+Tm0uZSfaMV58Jt3N8Mux2K2k09Kvcyo3+p76mlf3qj8tOPn8Glz3UE/N+cmuX2UUg+fhm2Iw+02F+23bo5HVV3TSvL5L5aMX3+DR57qHPnLzk1y+FwlM4AAAAAAAAAAAAAAAAKweNTfeWjsdU0BpK86NQ3tL/f7qnL5rGhJdoxfpVmn2fnGL583FoIs8bu+T1Pla23WlrvnB2NXjJXFKXa8rxf3E1504NflKS58opurfmw+7LSeCLY2OqsnT3E1VadWDsK3/ZttUj8t5Xi/vtPzpwf8pSXHlFphKngk2Pej8NDX+qLTo1BkaPFjb1I/NZW8l5tPyqTXn6xjwuzckWeODkAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAfmc4whKc5KMYrltvhJe4HUzmVx2Dw93mMveUrOws6Mq1xXqviNOEVy2zXL4kN3szvdrm0w2nrS9/sS3rqlicfCLdW5qy+X4sorznLniK79K+rfPveMXfZ7iZj+5+lbif917Cs/iVYSf/AGlWT7T+tOL+6vV/N+zxOfg22EjoXGUtcartOdUXtL/drepHvjqMl5celWSfzPzin09uZchkfhU2Jstq8F/bGXjTutWZCildVezjaQfD+BTf58dUvVr2S5nMAAAAAAAAAAAAAAAAGC727mYLazRFxqLMSVWs+adjZRnxUu63HaC9kvOUvRe74TDHvE1vJjtpdHOpRdK51HfxlDGWcnyk/J1qi/Yj/wBT4S9WtaGdyuQzeYu8vlbureX15WlWuK9R8yqTk+W2exuXrbPbgavvNT6iuvj3lzLtGPKp0aa+7TgvSMV5L82+W2z0dl9t85ujre203hY/Di18W8u5R5ha0U/mnL3ffhL1bS+qDJvDHs1kd2tYqFZVbbTmPnGeTu49m15qjB/ty48/wrlv0T2X4XGWGFxNricVaUrOxtKUaNvQpLiNOEVwkkeLtnonA7e6OstMadtvg2ltHmU5f4leo/vVJv1lLj/2S4SSMmAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVF8c+9/wDZ1pX2u0ref75cQ4zdzSl/g02v/h01+KS7z9otR79T4lfxVbw0NqdCv7BUp1NS5RSpYyk+H8Pj71eS/ZhyuE/OTS8ueKdeF3ai93j3FuMjnqlxVwdjVVzlricm53VSTbVLq83Kb5cn6Ln1aAkvwO7FxylxQ3P1bZ82dCp1YS0qx7VqkX/8RJP8MX933kufJLm7p8bK2t7Kzo2dpQp0LehTjTpUqcVGMIxXCikvJJJLg+wAAAAAAAAAAAAAAAPP1HmsXp3B3mczd7RscdZUnVuK9V8RhFf+79El3baS7sDp671Xg9E6WvdS6ivYWmPs4dU5P7036QgvxSk+yXqzWRv7urmd2db1M5kIu1saEXRx1ip9Ubalz7+s5ecper4Xkkl7fia3rym7mp4qjGrZabsJyWOsm+8n5OtU47Oo16eUV2Xm24rw2Nv8zlrTE4u1q3d9d1Y0behTXMqk5PhJfzA7mj9OZnVupLLTun7Gpe5K9qKnRpQX9W36RS5bb7JJs2aeHjaTE7SaJjiraVO6y1101cnfKPDr1Eu0Y891Tjy1FfVvzbMc8K2xdltRgJZLKqhd6sv6fF3cQ+aNtDz+BTftyk5S/E17JE3gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPJ1jqLFaT0vkdR5u5Vtj8fQlXrzfnwvJJesm+El6tpHrFF/H5ux/bOfp7aYS55sMZUVXKzhLtVuePlpfVU0+X+8/eIEM621BqzfneeNejbSq5DK3EbXHWak3C2opvohz6RiuZSl79UuxsZ2V29xe2W31hpbGdNSdKPxLy5UeHc3Ekuuo/6JJekUl6EEeAfaVYTTs9ys3a8ZHK03TxcJx70bX1qfR1Gu37qXpJlrAAAAAAAAAAAAAAAAdXK5CxxOMucnk7ujZ2VrSlVr1601GFOEVy5NvySQDK5CxxONucnk7ujZ2VrTlVr1601GFOEVy5NvySRrt8WO/dxujlo4LT8q9tpKxqdVOMuYzvqi/4s16RX4Yvy55fd8R+viu8QV3udkJad03Ur2mkbapyk+YzyE0+1SovSC84wf8AE+/CjAdClVuK8KFCnOrVqSUIQhFuUpN8JJLzbA5tbevd3VK1taNSvXrTVOlTpxcpTk3wopLu2324Ng3hG8P1LbqwjqvVlvQr6ruqa+FTaUljabXeEX5Oo+eJSXl91duXLz/CJ4dYaIpUNba1tadXUtWHVZ2k0pRx0WvN+jqtf8q7LvyWcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAcAR74htxaG2O1uT1LzTlftK2xtKflUuZp9Hb1UeHNr2izX34ftB3u7u8VrjL+rWrWsqkr/ADFzJtydJS5m2/2pyko8+8+fQkTx97hLUu5tHR9jX6sfpyDhV6X8s7uaTqP69MemP0fWT14ENulpLan+899R6cpqVxue67wtY8qjH/NzKf1Uo+wFhLO3oWdpRtLWjCjQowjTpU4R4jCKXCil6JJcH1AAAAAAAAAAAAAAeRrDUuE0jpy81DqLIUbDG2kOurWqP+iS85Sb7KK7t9kB283lMdhMRdZfL3lGysLSk6txXrS6YU4LzbZr08VfiFvNz7uWnNNyuLHSNvU5cZfLUyE0+06i9IJ94w/zPvwo+X4l9/c1uvlJY3H/AGjGaToT5t7Fy4ncNPtVrcdnL2j3Ufq+7h7EY6/y+UtsXi7SteXt1UVKhQowcp1Jt8JJLzYHwt6Na4uKdvb0p1q1WShTpwi5SnJvhJJd22/Qvn4SPDhT0ZG31trm2p1tRyip2VjLiUcen+KXo63+kfz7r0fCx4b7Hb6lb6r1hSoX+q5xUqNLtOljeV5RflKr7z8l5R9ZOx4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMe3I1LbaN0Fm9UXXDp4yyqXCi39+SXyR/zS6V/MyErT+kL1M8VtBZaeo1Omrm8hGNRc+dGiviS/6/hgUu2/wmS3K3axeHuK1SveZzJp3dZ95NSk51qj/KPXL+Rthsba3srOjZ2lGFG3oU406VOC4jCEVxFJeiSSRQ39HXppZLdPL6lrU1Knhsd0U5NfdrV5dKa/yRqr+ZfgAAAAAAAAAAAABDniH390xtPZuxSjltS1afVQxtOfCpp+U60vwR9l96XouO6DN90dwtL7b6Yq5/VGQjb0VzGhRh81a5qcdoU4/il/ovNtLua4/EBvPqTdzUKuL9uxw1tJ/YMZTqNwpfvyfbrqNecuPouEY3uduBqjcbUtTPapyMrq4acaVOPy0reH7FOP4Y/6vzbbPU2W2m1ZurqH+zdP2yp2lFp3mQrJqhbRfu/WT9Iru/ouWgxjR2mc7rDUNrgNN42vkcjcy4p0aS9PWUn5RivWT4S9TYj4Z9gMLtRj1lMg6OU1XcU+K1508wtk13p0ee6Xo5dnL6LsZVshtDpTafAfYcHb/HyFaK+25KtFfGuX7fuwT8oLsvXl9yRAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABRf9JFlfja60vhlPlWuNqXDj7OrU6f8A2pF6CgH6RSlUhvNi6sotQnhKXQ/R8VavIEr/AKN7Gwpbaaky6jHrucwrdv1apUYSX+tVlqCq/wCjeyVKrtpqTEKadW2zCuJR9VGrRhFP+tKX9C1AAAAAAAAAA+dxWpW9CpXr1YUqVOLnOc5KMYxS5bbfZJL1ME3f3d0RtdjftGpcmvtlSLlb4634nc1/yhz2X70ml9She/XiF1junVqY/reF051fJjLao38VejrT7Oo/p2iu3bnuBO/iJ8Wttj/tGm9rKlO7u1zCtm5RUqNL3VCL7Tf77+X2UueVS7K5C+yuRuMjkruveXlzUdSvXrzc51Jvu5Sk+7Z2NM4HM6mzdthcBjbnJZG5l00rehDqlL6/RLzbfZLuy7fh88JeK0/K31DuT9ny+UjxOli4Pqtbd+a+I/8AiyXt9zz+92YEG+HPw26j3Kq0M5nfj4PSvKl9olDiveL2oxfp/wCI+3spd0bAtFaVwGjNO22n9NYyhjsdbr5KVNfefrKTfeUn6yfLZ7EIRpwjCEVGMVwklwkvY/QAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACpP6RzSE7vTGnta2tFyePrzsbuSXPFOr81Nv6KcZL85otseLrjTWK1jpLJaZzdF1rDI0JUaqX3lz5Si/SUWlJP0aQFBPAtuFa6M3Zlh8pcKhjdRUY2jnJ8RhcRlzRbfs25w/OaNihqh3o201DtZrSvgc1SlKk26ljexi1Tu6XPacfZ+XMfOL/k3Y/w8+Le2scVbab3RVzL7PBU6Gao03VlKK7JV4L5m0vxx5b9Vzy2F0AYhpnc7bzUtGNTCa0wN45R6vhxvYRqJfWEmpL+aO9m9caMwlJVcxqzBWEGm4u4yFKHUl58cy7/AMgMhBBusvFTs/p6E42ubuc9cR5/VYy2lNc/+ZPphx+TZX/cnxl6xy8KtpovD2mnbeXZXNZq5ufzXKUI/wDLL8wLo651rpXRGJeU1VnbPFWy56XWn89R+0ILmU39IplRt6vGNfXka2J2xsZ2FF8xllr2mnWf1pUu8Y/nLl9/uplWdTahzup8rPKagy17lL2p2lWuqrqS/Jc+S+i7Em7TeG/crcB0ruGL/sPET7/bsnF01KPvCn9+f0fCX1AijN5XJ5vKV8pl7+5v764l11ri4qOdSb93J9yZ9jfDNrjcX4OUyUJab0/PiSu7uk/i14/+FS7Nr96XEfbnyLZ7OeGbbzb+VHIXVs9SZqm1JXl/TThTl706XeMfzfU16NE3gYPtJtVovbDEOx0vi4069SKVzfVuJ3Nx/HPjy/dXEV7GcgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYvuToHSu4mnp4PVeLp3ts31Up89NWhPjjrpzXeMv9H5NNdinu5/gy1NjqlW70DmbfNWvLcbO9kqFzFeiU/wDDn+b6PyL1ADVBndpNz8HXnSyWg9Q03DnmcLCdWHb2nBOLX5M82y0Bru9qOnaaM1DWkvNQxlZ//wBptw4Q4X1/qBrC094c95s3VUaWiL60g33qX84W0V/zyT/omTFojwT5mvKFbWWr7Oyp+crfGUZVpte3xJ9Ki/8ALIu3wvY5Ai7bLYPbHb+VK5xOn6d5kab5WQyLVxXT948rpg/4YolEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//9k=";
  // ── Restore last open quote on refresh ──────────────────────────────────────
  useEffect(()=>{
    const lastId=localStorage.getItem("vibrato_last_quote_id");
    if(!lastId)return;
    supabase.from("quotes")
      .select("id, opportunity, customer, rfq, revision, stage, total, approval_status, won_approval_status, updated_at, data, source")
      .eq("id",lastId)
      .single()
      .then(({data,error})=>{
        if(error||!data)return;
        const q=data.data||{};
        const restored={
          ...q,
          id:data.id,
          opp:data.opportunity||q.opp,
          customer:data.customer||q.customer,
          rfq:data.rfq||q.rfq,
          total:data.total??q.total,
          savedAt:data.updated_at,
          source:data.source||"vibrato",
          approval:{...(q.approval||{}),status:data.approval_status||q.approval?.status||"none"},
        };
        handleLoad(restored);
      });
  },[]);

const STANDARD_TERMS = [
    "All work to be performed during normal business hours unless specifically noted on this quote.",
    "Customer is to supply all installation hardware, cables, hoses, mating connections for power or fluid, electrical/resistive and dummy loads, and specialized monitoring equipment/peripheral equipment unless other arrangements with NU Laboratories, Inc. have been made. No functional testing shall be performed by NU Laboratories or its personnel unless specifically addressed in our quotation.",
    "All equipment, including the UUT, support equipment, test fixtures, mounting brackets, etc. are to be delivered to NU Laboratories no later than (5) business days prior to the scheduled testing start date.",
    "Return shipping arrangements are to be provided prior to the start of testing. If not, storage charges will apply beginning (5) business days after the completion of testing.",
    "If applicable, all import and export documentation is to be provided by the customer.",
    "Out of scope work including additional efforts and standby charges are to be determined at NU Laboratories' discretion and will be quoted separately.",
    "This quote does not guarantee a specific testing schedule, nor does it represent a fixed number of testing days. Scheduling will be secured with the receipt of a purchase order and/or test procedure approval.",
    "The provided quote is based on a pass scenario and does not account for any additional time required due to test item malfunctions or failures. Should the customer's representative request a retest or engineering evaluation, a separate quote will be issued.",
    "Any requested lead times are estimated and may be subject to change.",
    "This quote is based on a total purchase and is good for a period of 90 days.",
    "All hardware provided by NU Laboratories is assumed to be SAE Grade 5. All fixturing provided by NU Laboratories is assumed to be A36 Steel. All other hardware and fixture requirements will be quoted separately if not detailed on this quote.",
  ];

  // ── Calculator EMI/PQ PDF adapters ──────────────────────────────────────────
  // These adapt calculator state to the existing PDF builders which read from App scope
  // by temporarily injecting the calculator data as the active EMI/PQ instance

  const exportCalcEmi461fPDF = async (calcState) => {
    if(window.jspdf){await buildEmi461fPDF(calcState);return;}
    const s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload=()=>buildEmi461fPDF(calcState);
    document.head.appendChild(s);
  };

  const exportCalcEmi461gPDF = async (calcState) => {
    if(window.jspdf){await buildEmi461gPDF(calcState);return;}
    const s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload=()=>buildEmi461gPDF(calcState);
    document.head.appendChild(s);
  };

  const exportCalcPq300bPDF_calc = async (calcState) => {
    if(window.jspdf){await buildPq300bPDF(calcState);return;}
    const s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload=()=>buildPq300bPDF(calcState);
    document.head.appendChild(s);
  };

  const exportCalcPq300Part1PDF_calc = async (calcState) => {
    if(window.jspdf){await buildPq300Part1PDF(calcState);return;}
    const s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload=()=>buildPq300Part1PDF(calcState);
    document.head.appendChild(s);
  };

  const loadJsPDF = (cb) => {
    // Load jsPDF then autotable, always in sequence to be safe
    const doLoad = () => {
      const s2=document.createElement("script");
      s2.src="https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js";
      s2.onload=()=>{ try{cb();}catch(e){console.error('PDF build error:',e);} };
      document.head.appendChild(s2);
    };
    if(window.jspdf&&(window.jspdf.jsPDF||window.jspdf.default)){
      doLoad(); return;
    }
    const s=document.createElement("script");
    s.src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    s.onload=doLoad;
    document.head.appendChild(s);
  };

  const exportPDF = async () => { loadJsPDF(()=>buildPDF(false)); };
  const exportBudgetPDF = async () => { loadJsPDF(()=>buildPDF(true)); };

  const exportDcMagPDF = async () => {
    if(window.jspdf){await buildDcMagPDF();return;}
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    script.onload = () => buildDcMagPDF();
    document.head.appendChild(script);
  };

  const buildDcMagPDF = async () => {
    const {jsPDF} = window.jspdf;
    const doc = new jsPDF({unit:"pt",format:"letter"});
    const PW = doc.internal.pageSize.getWidth();
    const PH = doc.internal.pageSize.getHeight();
    const ML = 54, MR = 54, TW = PW - ML - MR;
    const RED = [192,57,43], DARK = [30,30,30], MUTED = [100,100,100], LIGHT = [240,240,240], GREEN = [22,101,52];
    let y = 44;

    const setF = (style, size, color) => {
      doc.setFont('helvetica', style);
      doc.setFontSize(size);
      doc.setTextColor(...(color||DARK));
    };
    const drawFooter = () => {
      setF('normal', 8, MUTED);
      doc.text('NU Laboratories, Inc. | '+(qi.opp||''), ML, PH-18);
      doc.text('Page 1 | '+(qi.revDate||qi.date||''), PW-MR, PH-18, {align:'right'});
      doc.setDrawColor(...LIGHT); doc.setLineWidth(0.5);
      doc.line(ML, PH-26, PW-MR, PH-26);
    };

    // ── Header ──
    try { doc.addImage(NU_LOGO_PDF, 'PNG', ML, y, 180, 40); }
    catch(e) { setF('bold', 14, RED); doc.text('NU LABORATORIES', ML, y+28); }
    setF('normal', 8.5, DARK);
    ['312 Old Allerton Road','Annandale, NJ 08801-3206',
     'Tel: 908-713-9300 | Fax: 908-713-9001','sales@nulabs.com']
      .forEach((l,i) => doc.text(l, PW-MR, y+14+i*11, {align:'right'}));
    y += 54;
    doc.setDrawColor(...RED); doc.setLineWidth(1.5);
    doc.line(ML, y, PW-MR, y);
    y += 18;

    // ── Title block ──
    setF('bold', 13, DARK); doc.text('DC MAGNETICS', ML, y);
    setF('normal', 8.5, MUTED); doc.text('Test Specifications', ML, y+13);
    setF('normal', 9, MUTED); doc.text('Date: '+(qi.revDate||qi.date||''), PW-MR, y, {align:'right'});
    if(qi.opp){ setF('bold',9,DARK); doc.text(qi.opp, PW-MR, y+13, {align:'right'}); }
    y += 34;
    doc.setDrawColor(...LIGHT); doc.setLineWidth(0.5);
    doc.line(ML, y, PW-MR, y);
    y += 18;

    // ── Test Item Details ──
    doc.setFillColor(...LIGHT);
    doc.rect(ML, y-2, TW, 18, 'F');
    doc.setFillColor(...RED); doc.rect(ML, y-2, 3, 18, 'F');
    setF('bold', 9, RED); doc.text('TEST ITEM', ML+10, y+10);
    y += 22;

    const sizeStr = [ti.dimL&&ti.dimL+'"', ti.dimW&&ti.dimW+'"', ti.dimH&&ti.dimH+'"'].filter(Boolean).join(' x ');
    const pwrParts = [ti.volt&&ti.volt+' V '+(ti.pwrType||'AC'), ti.phase&&ti.phase+' Ph', ti.hz&&ti.hz+' Hz', ti.amps&&ti.amps+' A'].filter(Boolean);

    const tiRows = [
      ['Unit', ti.item],
      ['Dimensions', sizeStr],
      ['Weight', ti.wt&&ti.wt+' lbs'],
      ['Power', pwrParts.join(', ')],
    ].filter(r=>r[1]);

    tiRows.forEach(([label, value], i) => {
      doc.setFillColor(...(i%2===0?[255,255,255]:[247,248,250]));
      doc.rect(ML, y-2, TW, 16, 'F');
      setF('bold', 9, MUTED); doc.text(label, ML+8, y+9);
      setF('normal', 9, DARK); doc.text(String(value), ML+110, y+9);
      y += 16;
    });
    y += 16;

    // ── Test Specification block ──
    doc.setFillColor(...LIGHT);
    doc.rect(ML, y-2, TW, 18, 'F');
    doc.setFillColor(...RED); doc.rect(ML, y-2, 3, 18, 'F');
    setF('bold', 9, RED); doc.text('TEST SPECIFICATION', ML+10, y+10);
    y += 28;

    // Spec box — clean bordered card, no fill
    doc.setFillColor(247,248,250);
    doc.setDrawColor(...LIGHT);
    doc.setLineWidth(0.5);
    doc.rect(ML, y, TW, 90, 'FD');
    doc.setFillColor(...RED); doc.rect(ML, y, 3, 90, 'F');

    setF('bold', 11, DARK); doc.text('DC Magnetics', ML+14, y+18);
    setF('normal', 8.5, MUTED); doc.text('DOD-STD-1399 Section 070', ML+14, y+30);

    doc.setDrawColor(220,220,220); doc.setLineWidth(0.4);
    doc.line(ML+14, y+38, ML+TW-14, y+38);

    const specRows=[['Field Strength','1,600 A/m'],['Positions','Three (3) orthogonal positions']];
    specRows.forEach(([lbl,val],i)=>{
      setF('normal',9,MUTED); doc.text(lbl+':', ML+14, y+52+i*18);
      setF('bold',9,DARK);    doc.text(val,          ML+110, y+52+i*18);
    });
    y += 106;

    // ── General Notes ──
    y += 8;
    doc.setFillColor(...LIGHT);
    doc.rect(ML, y-2, TW, 18, 'F');
    doc.setFillColor(...RED); doc.rect(ML, y-2, 3, 18, 'F');
    setF('bold', 9, RED); doc.text('GENERAL NOTES', ML+10, y+10);
    y += 20;
    const generalNotes = [
      'Pricing is based on customer-supplied information and the assumptions listed herein.',
      'Feasibility of testing will be reviewed upon receipt of a purchase order and/or test procedure approval.',
      'The number of tests required for each test method and/or the number of test positions listed in this document are estimated values. Exact quantities will be determined and documented in the approved test procedure.',
    ];
    setF('normal', 9, DARK);
    generalNotes.forEach(note => {
      const w = doc.splitTextToSize('*  ' + note, TW - 10);
      checkY(w.length*13+6);
      doc.text(w, ML+6, y); y += w.length*13+6;
    });
    y += 4;

    // ── DCM instances — spec fields if filled ──
    const activeDcms = dcms.filter(s=>s.on);
    if(activeDcms.length>0 && activeDcms.some(s=>s.spec)){
      y += 8;
      doc.setFillColor(...LIGHT);
      doc.rect(ML, y-2, TW, 18, 'F');
      doc.setFillColor(...RED); doc.rect(ML, y-2, 3, 18, 'F');
      setF('bold', 9, RED); doc.text('ADDITIONAL NOTES', ML+10, y+10);
      y += 22;
      activeDcms.forEach((s,i)=>{
        if(!s.spec) return;
        const label = activeDcms.length>1 ? 'Unit #'+(i+1)+(s.identifier?' ('+s.identifier+')':'') : 'Specification';
        setF('bold',9,MUTED); doc.text(label+':', ML+8, y);
        setF('normal',9,DARK); doc.text(s.spec, ML+110, y);
        y += 14;
      });
    }

    drawFooter();
    const fname = (qi.opp||'DC-Mag-Specs')+'.pdf';
    await savePdfAs(doc, fname);
  };

  const exportPq300bPDF = async () => {
    if(window.jspdf){await buildPq300bPDF();return;}
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    script.onload = () => buildPq300bPDF();
    document.head.appendChild(script);
  };

  const buildPq300bPDF = async (pqOverride=null) => {
    const {jsPDF} = window.jspdf;
    const doc = new jsPDF({unit:"pt",format:"letter"});
    const PW = doc.internal.pageSize.getWidth();
    const PH = doc.internal.pageSize.getHeight();
    const ML = 54, MR = 54, TW = PW - ML - MR;
    const RED = [192,57,43], DARK = [30,30,30], MUTED = [100,100,100], LIGHT = [240,240,240], BLUE = [26,82,118];
    let y = 44;
    let pageNum = 1;

    const setF = (style, size, color) => {
      doc.setFont('helvetica', style);
      doc.setFontSize(size);
      doc.setTextColor(...(color||DARK));
    };
    const checkY = (need) => {
      if(y + (need||20) > PH - 52){
        drawFooter();
        doc.addPage();
        pageNum++;
        y = 54;
      }
    };
    const drawFooter = () => {
      const p = doc.internal.getCurrentPageInfo().pageNumber;
      setF('normal', 8, MUTED);
      doc.text('NU Laboratories, Inc. | '+(qi.opp||''), ML, PH-18);
      doc.text('Page '+p+' | '+(qi.revDate||qi.date||''), PW-MR, PH-18, {align:'right'});
      doc.setDrawColor(...LIGHT); doc.setLineWidth(0.5);
      doc.line(ML, PH-26, PW-MR, PH-26);
    };
    const sectionHdr = (title) => {
      checkY(28);
      y += 8;
      doc.setFillColor(...LIGHT);
      doc.rect(ML, y-2, TW, 18, 'F');
      doc.setFillColor(...RED); doc.rect(ML, y-2, 3, 18, 'F');
      setF('bold', 9, RED); doc.text(title.toUpperCase(), ML+10, y+10);
      y += 22;
    };

    // ── Header ──
    try { doc.addImage(NU_LOGO_PDF, 'PNG', ML, y, 180, 40); }
    catch(e) { setF('bold', 14, RED); doc.text('NU LABORATORIES', ML, y+28); }
    setF('normal', 8.5, DARK);
    ['312 Old Allerton Road','Annandale, NJ 08801-3206',
     'Tel: 908-713-9300 | Fax: 908-713-9001','sales@nulabs.com']
      .forEach((l,i) => doc.text(l, PW-MR, y+14+i*11, {align:'right'}));
    y += 54;
    doc.setDrawColor(...RED); doc.setLineWidth(1.5);
    doc.line(ML, y, PW-MR, y);
    y += 18;

    // ── Title ──
    setF('bold', 13, DARK); doc.text('POWER QUALITY', ML, y);
    setF('normal', 8.5, MUTED); doc.text('MIL-STD-1399 Section 300B — Test Specifications', ML, y+13);
    setF('normal', 9, MUTED); doc.text('Date: '+(qi.revDate||qi.date||''), PW-MR, y, {align:'right'});
    if(qi.opp){ setF('bold',9,DARK); doc.text(qi.opp, PW-MR, y+13, {align:'right'}); }
    y += 34;
    doc.setDrawColor(...LIGHT); doc.setLineWidth(0.5);
    doc.line(ML, y, PW-MR, y);
    y += 16;

    // ── Test Item ──
    sectionHdr('Test Item');
    const sizeStr = [ti.dimL&&ti.dimL+'"',ti.dimW&&ti.dimW+'"',ti.dimH&&ti.dimH+'"'].filter(Boolean).join(' x ');
    const pwrParts = [ti.volt&&ti.volt+' V '+(ti.pwrType||'AC'),ti.phase&&ti.phase+' Ph',ti.hz&&ti.hz+' Hz',ti.amps&&ti.amps+' A'].filter(Boolean);
    [['Unit',ti.item],['Dimensions',sizeStr],['Weight',ti.wt&&ti.wt+' lbs'],['Power',pwrParts.join(', ')]]
      .filter(r=>r[1]).forEach(([label,value],i)=>{
        doc.setFillColor(...(i%2===0?[255,255,255]:[247,248,250]));
        doc.rect(ML, y-2, TW, 16, 'F');
        setF('bold',9,MUTED); doc.text(label, ML+8, y+9);
        setF('normal',9,DARK); doc.text(String(value), ML+110, y+9);
        y += 16;
      });
    y += 10;

    // ── Full 300B test data ──
    const PQ_300B_FULL = [
      {key:"B5.3.1", label:"Voltage and frequency tolerance test",
       req:"Type 1 single phase (123/107) V ac, (62/57) Hz",
       ref:"Table II for shipboard and submarine applications",
       note:null},
      {key:"B5.3.2", label:"Voltage and frequency transient tolerance and recovery test",
       req:"138 V ac / 63.3 Hz; 92 V ac / 56.7 Hz",
       ref:"Table III",
       note:null},
      {key:"B5.3.3", label:"Voltage spike test",
       req:"900 to 1000 V peak line-to-line and line-to-ground, or 2400 to 2500 V peak line-to-line and line-to-ground",
       ref:"Figure 23, 24 or 25",
       note:"Voltage spike impulse wave shape using IEC 61000-4-5 1.2/50 uS open circuit waveform definition. Overshoot may exceed figure. Or voltage spike impulse wave shape of Figure 6 NAVSEA deviation for light fixtures (MIL-DTL-16377 SSL)."},
      {key:"B5.3.4", label:"Emergency condition test",
       req:"70 ms dropout, 2 minute dropout; voltage and frequency decay characteristics for half-load curve; 67.2 Hz for 2 minutes / 155.25 V ac for 2 min",
       ref:"Figure 8, Table VI",
       note:null},
      {key:"B5.3.5", label:"Grounding test",
       req:"100,000-ohm; each lead grounded individually for 5 minutes",
       ref:null,
       note:null},
      {key:"B5.3.6", label:"User equipment power profile test",
       req:"User voltage and power characteristics per Section 5.3.6 a. through m. as required",
       ref:null,
       note:"Inrush current measurement may be limited by the capabilities of the AC source used, which may not cover 10x nominal current or higher. If inrush exceeds source capability the measurement cannot be made as desired. Will report what is measured and make a best effort attempt using facility power directly (5 attempts)."},
      {key:"B5.3.7", label:"Current waveform test",
       req:"120 Hz to 20 kHz, < 1 kVA limits as applicable",
       ref:null,
       note:"Requirement met using MIL-STD-461F/G test method CE101 with frequency extended to 20 kHz. A non-regulated power source may be needed as regulated source switching produces inconsistent current waveform data. Not required for currents < 1 A per NAVSEA."},
      {key:"B5.3.8", label:"Voltage and frequency modulation test",
       req:"Frequency modulation 0.5%; voltage modulation 2%. Periods of 17 ms, 75 ms, 250 ms, 500 ms, 1 s, 5 s and 10 s each repeated ten consecutive times",
       ref:"Table VII",
       note:null},
      {key:"B5.3.9", label:"Simulated human body leakage current test",
       req:"60 Hz to 700 Hz < 5 mA; 700 Hz to 100 kHz < 70 mA",
       ref:"Figure 28, Figure 31",
       note:null},
      {key:"B5.3.10.1", label:"Equipment insulation resistance test",
       req:"500 V dc for 60 seconds; resistance to ground > 10 MOhm",
       ref:null,
       note:null},
      {key:"B5.3.10.2", label:"Active ground detection test",
       req:"For 440 V rms EUT: AC source 622.2 V peak, DC source 505 VDC. For 115 V rms EUT: AC source 162.6 V peak, DC source 155 VDC.",
       ref:null,
       note:"AGD is run on one line only per NAVSEA direction. Verify if legacy requirements apply."},
    ];

    // Only show rows selected by the user across all active PQ instances
    const selectedKeys = new Set();
    pqs.filter(s=>s.on).forEach(s=>{
      PQ_300B_FULL.forEach(r=>{ if(s.rows?.[r.key]) selectedKeys.add(r.key); });
    });
    const activeRows = PQ_300B_FULL.filter(r=>selectedKeys.has(r.key));

    if(activeRows.length===0){
      setF('normal',10,MUTED); doc.text('No MIL-STD-1399 Section 300B tests selected.', ML, y); y+=20;
    } else {
      sectionHdr('MIL-STD-1399 Section 300B — Selected Tests');

      activeRows.forEach((r,idx)=>{
        const WRAP = TW - 20;
        doc.setFont('helvetica','bold'); doc.setFontSize(8.5);
        const hdrLines  = doc.splitTextToSize(r.key.replace('B','')+' — '+r.label, WRAP);
        doc.setFont('helvetica','normal'); doc.setFontSize(8.5);
        const reqLines  = r.req ? doc.splitTextToSize(r.req, WRAP) : [];
        doc.setFont('helvetica','normal'); doc.setFontSize(8);
        const refLines  = r.ref ? doc.splitTextToSize('Tables / Figures: '+r.ref, WRAP) : [];
        doc.setFont('helvetica','italic'); doc.setFontSize(7.5);
        const noteLines = r.note ? doc.splitTextToSize('Note: '+r.note, WRAP) : [];
        const rowH = hdrLines.length*14+8
          + (reqLines.length>0 ? reqLines.length*12+6 : 0)
          + (refLines.length>0 ? refLines.length*11+5 : 0)
          + (noteLines.length>0 ? noteLines.length*12+6 : 0)
          + 10;

        checkY(rowH+2);
        doc.setFillColor(...(idx%2===0?[238,244,250]:[230,238,246]));
        doc.rect(ML, y, TW, hdrLines.length*13+10, 'F');
        doc.setFillColor(255,255,255);
        doc.rect(ML, y+hdrLines.length*13+10, TW, rowH-(hdrLines.length*13+10), 'F');

        let ry=y+12;
        setF('bold',8.5,BLUE); doc.text(hdrLines, ML+8, ry); ry+=hdrLines.length*14+4;
        if(reqLines.length>0){ setF('normal',8.5,DARK); doc.text(reqLines, ML+10, ry); ry+=reqLines.length*12+6; }
        if(refLines.length>0){ setF('normal',8,MUTED); doc.text(refLines, ML+10, ry); ry+=refLines.length*11+5; }
        if(noteLines.length>0){ setF('italic',7.5,[110,85,40]); doc.text(noteLines, ML+10, ry); ry+=noteLines.length*12+5; }

        doc.setDrawColor(...LIGHT); doc.setLineWidth(0.4);
        doc.line(ML, y+rowH, ML+TW, y+rowH);
        y += rowH;
      });
      y += 8;
    }

    // ── General Notes — force new page ──
    drawFooter();
    doc.addPage();
    y=54;
    sectionHdr('General Notes');
    y+=4;
    const generalNotes = [
      'Pricing is based on customer-supplied information and the assumptions listed herein.',
      'Feasibility of testing will be reviewed upon receipt of a purchase order and/or test procedure approval.',
      'The number of tests required for each test method and/or the number of test positions listed in this document are estimated values. Exact quantities will be determined and documented in the approved test procedure.',
    ];
    generalNotes.forEach((note,i)=>{
      const w=doc.splitTextToSize(note, TW-22);
      const blockH=w.length*13+10;
      checkY(blockH+4);
      doc.setFillColor(...LIGHT); doc.circle(ML+8,y+5,5,'F');
      setF('bold',8,MUTED); doc.text(String(i+1),ML+8,y+8,{align:'center'});
      setF('normal',9,DARK); doc.text(w, ML+20, y+8);
      y+=blockH;
    });
    y+=4;

    const fname=(qi.opp?(qi.opp+' Test Specifications'):'PQ-300B-Test-Specifications')+'.pdf';
    await savePdfAs(doc, fname);
  };

  const exportEmi461fPDF = async () => {
    if(window.jspdf){await buildEmi461fPDF();return;}
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    script.onload = () => buildEmi461fPDF();
    document.head.appendChild(script);
  };

  const buildEmi461fPDF = async (emiOverride=null) => {
    const {jsPDF} = window.jspdf;
    const doc = new jsPDF({unit:"pt",format:"letter"});
    const PW = doc.internal.pageSize.getWidth();
    const PH = doc.internal.pageSize.getHeight();
    const ML = 54, MR = 54, TW = PW - ML - MR;
    const RED=[192,57,43],DARK=[30,30,30],MUTED=[100,100,100],LIGHT=[240,240,240],BLUE=[26,82,118];
    let y = 44;

    const setF=(style,size,color)=>{doc.setFont('helvetica',style);doc.setFontSize(size);doc.setTextColor(...(color||DARK));};
    const checkY=(need)=>{if(y+(need||20)>PH-52){drawFooter();doc.addPage();y=54;}};
    const drawFooter=()=>{
      const p=doc.internal.getCurrentPageInfo().pageNumber;
      setF('normal',8,MUTED);
      doc.text('NU Laboratories, Inc. | '+(qi.opp||''),ML,PH-18);
      doc.text('Page '+p+' | '+(qi.revDate||qi.date||''),PW-MR,PH-18,{align:'right'});
      doc.setDrawColor(...LIGHT);doc.setLineWidth(0.5);doc.line(ML,PH-26,PW-MR,PH-26);
    };
    const sectionHdr=(title)=>{
      checkY(28);y+=8;
      doc.setFillColor(...LIGHT);doc.rect(ML,y-2,TW,18,'F');
      doc.setFillColor(...RED);doc.rect(ML,y-2,3,18,'F');
      setF('bold',9,RED);doc.text(title.toUpperCase(),ML+10,y+10);y+=22;
    };

    // ── Header ──
    try{doc.addImage(NU_LOGO_PDF,'PNG',ML,y,180,40);}
    catch(e){setF('bold',14,RED);doc.text('NU LABORATORIES',ML,y+28);}
    setF('normal',8.5,DARK);
    ['312 Old Allerton Road','Annandale, NJ 08801-3206',
     'Tel: 908-713-9300 | Fax: 908-713-9001','sales@nulabs.com']
      .forEach((l,i)=>doc.text(l,PW-MR,y+14+i*11,{align:'right'}));
    y+=54;
    doc.setDrawColor(...RED);doc.setLineWidth(1.5);doc.line(ML,y,PW-MR,y);y+=18;

    // ── Title ──
    setF('bold',13,DARK);doc.text('EMI TESTING',ML,y);
    setF('normal',8.5,MUTED);doc.text('MIL-STD-461F -- Test Specifications',ML,y+13);
    setF('normal',9,MUTED);doc.text('Date: '+(qi.revDate||qi.date||''),PW-MR,y,{align:'right'});
    if(qi.opp){setF('bold',9,DARK);doc.text(qi.opp,PW-MR,y+13,{align:'right'});}
    y+=34;
    doc.setDrawColor(...LIGHT);doc.setLineWidth(0.5);doc.line(ML,y,PW-MR,y);y+=16;

    // ── Test Item ──
    sectionHdr('Test Item');
    const sizeStr=[ti.dimL&&ti.dimL+'"',ti.dimW&&ti.dimW+'"',ti.dimH&&ti.dimH+'"'].filter(Boolean).join(' x ');
    const pwrParts=[ti.volt&&ti.volt+' V '+(ti.pwrType||'AC'),ti.phase&&ti.phase+' Ph',ti.hz&&ti.hz+' Hz',ti.amps&&ti.amps+' A'].filter(Boolean);
    [['Unit',ti.item],['Dimensions',sizeStr],['Weight',ti.wt&&ti.wt+' lbs'],['Power',pwrParts.join(', ')]]
      .filter(r=>r[1]).forEach(([label,value],i)=>{
        doc.setFillColor(...(i%2===0?[255,255,255]:[247,248,250]));
        doc.rect(ML,y-2,TW,16,'F');
        setF('bold',9,MUTED);doc.text(label,ML+8,y+9);
        const valLines=doc.splitTextToSize(String(value),TW-112);
        setF('normal',9,DARK);doc.text(valLines,ML+110,y+9);
        y+=16;
      });
    y+=10;

    // Compute all positions and test counts from the same math as shift calculations
    const activeEmi = emiOverride ? {...emiOverride, on:true} : (emis.find(s=>s.on)||(emis[0]||{}));
    const dispL = activeEmi.dimL||ti.dimL||'0';
    const dispW = activeEmi.dimW||ti.dimW||'0';
    const dispH = activeEmi.dimH||ti.dimH||'0';
    const emiCalcData = calcEmiShifts({
      dimL:dispL, dimW:dispW, dimH:dispH,
      cables:activeEmi.cables||'0',
      setupCables:setup?.cables||'0',
      phases:activeEmi.phases||ti.phase||'3',
      revs:{'Rev F':true},
    });
    const c114 = emiCalcData.CS114;
    const c116 = emiCalcData.CS116;
    const re102p = emiCalcData.RE102.pos;
    const rs101p = emiCalcData.RS101.pos;
    const rs103p = emiCalcData.RS103.pos;
    const pwrCables = sf(activeEmi.phases||ti.phase||'3',3)===1?2:4; // 1ph=2, 3ph=4
    const pos=(n)=>n+' position'+(n!==1?'s':'');

    // Full 461F test definitions — only show tests selected by user
    const EMI_461F = [
      {key:"CE101", label:"Conducted Emissions, Power Leads, 30 Hz to 10 kHz",
       desc:"Tested on each AC power input lead for a total of two (2) tests. Tested to MIL-STD-461F Figure CE101-2, input power < 1 kVA.",
       note:null},
      {key:"CE102", label:"Conducted Emissions, Power Leads, 10 kHz to 10 MHz",
       desc:"Tested on each AC power input lead for a total of two (2) tests. Tested to MIL-STD-461F Figure CE102-1 from 10 kHz to 10 MHz with 6 dB relaxation.",
       note:null},
      {key:"CS101", label:"Conducted Susceptibility, Power Leads, 30 Hz to 150 kHz",
       desc:"Tested on each AC high side for a total of one (1) test. Tested to MIL-STD-461F Figure CS101-1, Curve 1 and Figure CS101-2.",
       note:null},
      {key:"CS106", label:"Conducted Susceptibility, Transients, Power Leads",
       desc:"Tested on each AC high side for a total of two (2) tests. Tested to MIL-STD-461F Figure CS106-1. Testing performed with a test generator compliant with CS06. Tested in charged mode of operation only.",
       note:"The overshoot on this generator is slightly higher than specified in CS106 but test results are generally accepted as this is considered worst case."},
      {key:"CS114", label:"Conducted Susceptibility, Bulk Cable Injection, 10 kHz to 200 MHz and 4 kHz to 1 MHz at 77 dB uA",
       desc:"Bulk injection on AC power input lead and on one lead individually. Common mode test on input leads for a total of "+c114.pwrTests+" tests for power leads. "+c114.sigTests+" test(s) on signal leads for a total of "+c114.totalTests+" tests. Tested to MIL-STD-461F Figure CS114-1, Curve 2 from 10 kHz to 200 MHz and from 4 kHz to 1 MHz at 77 dB uA.",
       note:null},
      {key:"CS116", label:"Conducted Susceptibility, Damped Sinusoidal Transients, Cables and Power Leads, 10 kHz to 100 MHz",
       desc:"Bulk injection on AC power input lead and on each lead individually for a total of "+c116.pwrTests+" tests for power leads. "+c116.sigTests+" test(s) on signal leads for a total of "+c116.totalTests+" tests. Tested to MIL-STD-461F Figure CS116-2 at discrete frequencies: 10 kHz, 100 kHz, 1 MHz, 10 MHz, 30 MHz and 100 MHz.",
       note:null},
      {key:"RE101", label:"Radiated Emissions, Magnetic Field, 30 Hz to 100 kHz",
       desc:"Applicable to all enclosures including electrical cable interfaces. Tested to MIL-STD-461F Figure RE101-2 from 30 Hz to 100 kHz.",
       note:null},
      {key:"RE102", label:"Radiated Emissions, Electric Field, 10 kHz to 18 GHz",
       desc:"Tested to MIL-STD-461F Figure RE102-1 for Metallic Ships below deck applications.",
       positions:[
         {range:"10 kHz - 30 MHz",   pos:pos(1)},
         {range:"30 MHz - 200 MHz",  pos:pos(1)},
         {range:"200 MHz - 1 GHz",   pos:pos(re102p.sub1GHz)},
         {range:"1 GHz - 4 GHz",     pos:pos(re102p.b1_4)},
         {range:"4 GHz - 15 GHz",    pos:pos(re102p.b4_15)},
         {range:"15 GHz - 18 GHz",   pos:pos(re102p.b15_18)},
       ],
       note:"Tested at width and cables only. Testing required to 10x the highest operating frequency or 1 GHz (whichever is greater), or if not known, to 18 GHz."},
      {key:"RS101", label:"Radiated Susceptibility, Magnetic Field, 30 Hz to 100 kHz",
       desc:"Applicable to all equipment enclosures including electrical cable interfaces. Tested to MIL-STD-461F Figure RS101-1 from 30 Hz to 100 kHz at approximately "+rs101p.total+" positions ("+rs101p.LW+" LxW + "+rs101p.LH+" LxH + "+rs101p.WH+" WxH).",
       note:"Applicability depends on application."},
      {key:"RS103", label:"Radiated Susceptibility, Electric Field, 2 MHz to 18 GHz",
       desc:"Tested to MIL-STD-461F Table VII for Ships metallic below deck from 2 MHz to 18 GHz at 10 V/m.",
       positions:[
         {range:"2 MHz - 30 MHz",    pos:pos(rs103p.b2_30)},
         {range:"30 MHz - 200 MHz",  pos:pos(rs103p.b30_200)},
         {range:"200 MHz - 1 GHz",   pos:pos(rs103p.b200_1G)},
         {range:"1 GHz - 4 GHz",     pos:pos(rs103p.b1_4)},
         {range:"4 GHz - 15 GHz",    pos:pos(rs103p.b4_15)},
         {range:"15 GHz - 18 GHz",   pos:pos(rs103p.b15_18)},
       ],
       note:null},
    ];

    // Only show tests selected by user
    const selectedKeys=new Set();
    if(emiOverride){
      Object.entries(emiOverride.tests||{}).forEach(([k,v])=>{if(v)selectedKeys.add(k);});
    } else {
      emis.filter(s=>s.on).forEach(s=>{
        Object.entries(s.tests||{}).forEach(([k,v])=>{if(v)selectedKeys.add(k);});
      });
    }
    const activeRows=EMI_461F.filter(r=>selectedKeys.has(r.key));

    if(activeRows.length===0){
      setF('normal',10,MUTED);doc.text('No MIL-STD-461F tests selected.',ML,y);y+=20;
    } else {
      sectionHdr('MIL-STD-461F -- Selected Tests');

      activeRows.forEach((r,idx)=>{
        const WRAP = TW - 20;
        // Set font BEFORE each splitTextToSize so measurements match rendering
        doc.setFont('helvetica','bold'); doc.setFontSize(8.5);
        const lblLines  = doc.splitTextToSize(r.label, TW-54);
        doc.setFont('helvetica','normal'); doc.setFontSize(8.5);
        const descLines = r.desc ? doc.splitTextToSize(r.desc, WRAP) : [];
        doc.setFont('helvetica','italic'); doc.setFontSize(7.5);
        const noteLines = r.note ? doc.splitTextToSize('Note: '+r.note, WRAP) : [];
        doc.setFont('helvetica','normal'); doc.setFontSize(8);
        const posRows = r.positions ? r.positions.map(({range,pos})=>({
          rng: doc.splitTextToSize(range+':',120),
          pos: doc.splitTextToSize(pos, TW-160)
        })) : [];
        const posH = posRows.reduce((a,pr)=>a+Math.max(pr.rng.length,pr.pos.length)*12+2,0)+(posRows.length>0?4:0);
        const rowH = lblLines.length*14+8
          + (descLines.length>0 ? descLines.length*12+6 : 0)
          + posH
          + (noteLines.length>0 ? noteLines.length*12+6 : 0)
          + 10;
        checkY(rowH+2);

        // Row background
        doc.setFillColor(...(idx%2===0?[238,244,250]:[230,238,246]));
        doc.rect(ML,y,TW,lblLines.length*14+10,'F');
        doc.setFillColor(255,255,255);
        doc.rect(ML,y+lblLines.length*14+10,TW,rowH-(lblLines.length*14+10),'F');
        let ry = y+13;

        // Key + label
        setF('bold',8.5,BLUE); doc.text(r.key, ML+6, ry);
        setF('bold',8.5,DARK); doc.text(lblLines, ML+52, ry);
        ry += lblLines.length*14+4;

        // Description
        if(descLines.length>0){
          setF('normal',8.5,DARK); doc.text(descLines, ML+10, ry); ry+=descLines.length*12+6;
        }

        // Position table (RE102, RS103)
        if(posRows.length>0){
          posRows.forEach(({rng,pos})=>{
            const h=Math.max(rng.length,pos.length)*12+2;
            setF('normal',8,[80,80,80]); doc.text(rng,ML+14,ry);
            setF('bold',8,DARK); doc.text(pos,ML+145,ry); ry+=h;
          });
          ry+=4;
        }

        // Note
        if(noteLines.length>0){
          setF('italic',7.5,[110,85,40]); doc.text(noteLines, ML+10, ry); ry+=noteLines.length*12+5;
        }

        doc.setDrawColor(...LIGHT); doc.setLineWidth(0.4);
        doc.line(ML,y+rowH,ML+TW,y+rowH);
        y+=rowH;
      });
      y+=8;
    }

    // ── General Notes — force new page ──
    drawFooter();
    doc.addPage();
    y=54;
    sectionHdr('General Notes');
    y+=4;
    const generalNotes=[
      'Pricing is based on customer-supplied information and the assumptions listed herein.',
      'Feasibility of testing will be reviewed upon receipt of a purchase order and/or test procedure approval.',
      'This quote assumes that susceptibility criteria can be determined in less than 3 seconds during real-time operation of the EUT. Customer to supply cables and all peripheral/monitoring equipment and one mode of operation (operating or standby). Susceptibility determination provided by the customer.',
      'Pricing and feasibility may be reevaluated upon completion and review of the NU Laboratories Test Configuration Form.',
      'The number of tests required for each test method and/or the number of test positions listed in this document are estimated values. Exact quantities will be determined and documented in the approved test procedure.',
    ];
    generalNotes.forEach((note,i)=>{
      const w=doc.splitTextToSize(note, TW-22);
      const blockH=w.length*13+10;
      checkY(blockH+4);
      doc.setFillColor(...LIGHT); doc.circle(ML+8,y+5,5,'F');
      setF('bold',8,MUTED); doc.text(String(i+1),ML+8,y+8,{align:'center'});
      setF('normal',9,DARK); doc.text(w, ML+20, y+8);
      y+=blockH;
    });
    y+=4;

    const tp=doc.internal.getNumberOfPages();
    for(let p=1;p<=tp;p++){doc.setPage(p);drawFooter();}
    const fname=(qi.opp?(qi.opp+' Test Specifications'):'EMI-461F-Test-Specifications')+'.pdf';
    await savePdfAs(doc, fname);
  };

  const exportEmi461gPDF = async () => {
    if(window.jspdf){await buildEmi461gPDF();return;}
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    script.onload = () => buildEmi461gPDF();
    document.head.appendChild(script);
  };

  const buildEmi461gPDF = async (emiOverride=null) => {
    const {jsPDF} = window.jspdf;
    const doc = new jsPDF({unit:"pt",format:"letter"});
    const PW = doc.internal.pageSize.getWidth();
    const PH = doc.internal.pageSize.getHeight();
    const ML = 54, MR = 54, TW = PW - ML - MR;
    const RED=[192,57,43],DARK=[30,30,30],MUTED=[100,100,100],LIGHT=[240,240,240],BLUE=[26,82,118];
    let y = 44;

    const setF=(style,size,color)=>{doc.setFont('helvetica',style);doc.setFontSize(size);doc.setTextColor(...(color||DARK));};
    const checkY=(need)=>{if(y+(need||20)>PH-52){drawFooter();doc.addPage();y=54;}};
    const drawFooter=()=>{
      const p=doc.internal.getCurrentPageInfo().pageNumber;
      setF('normal',8,MUTED);
      doc.text('NU Laboratories, Inc. | '+(qi.opp||''),ML,PH-18);
      doc.text('Page '+p+' | '+(qi.revDate||qi.date||''),PW-MR,PH-18,{align:'right'});
      doc.setDrawColor(...LIGHT);doc.setLineWidth(0.5);doc.line(ML,PH-26,PW-MR,PH-26);
    };
    const sectionHdr=(title)=>{
      checkY(28);y+=8;
      doc.setFillColor(...LIGHT);doc.rect(ML,y-2,TW,18,'F');
      doc.setFillColor(...RED);doc.rect(ML,y-2,3,18,'F');
      setF('bold',9,RED);doc.text(title.toUpperCase(),ML+10,y+10);y+=22;
    };

    // ── Header ──
    try{doc.addImage(NU_LOGO_PDF,'PNG',ML,y,180,40);}
    catch(e){setF('bold',14,RED);doc.text('NU LABORATORIES',ML,y+28);}
    setF('normal',8.5,DARK);
    ['312 Old Allerton Road','Annandale, NJ 08801-3206',
     'Tel: 908-713-9300 | Fax: 908-713-9001','sales@nulabs.com']
      .forEach((l,i)=>doc.text(l,PW-MR,y+14+i*11,{align:'right'}));
    y+=54;
    doc.setDrawColor(...RED);doc.setLineWidth(1.5);doc.line(ML,y,PW-MR,y);y+=18;

    // ── Title ──
    setF('bold',13,DARK);doc.text('EMI TESTING',ML,y);
    setF('normal',8.5,MUTED);doc.text('MIL-STD-461G -- Test Specifications',ML,y+13);
    setF('normal',9,MUTED);doc.text('Date: '+(qi.revDate||qi.date||''),PW-MR,y,{align:'right'});
    if(qi.opp){setF('bold',9,DARK);doc.text(qi.opp,PW-MR,y+13,{align:'right'});}
    y+=34;
    doc.setDrawColor(...LIGHT);doc.setLineWidth(0.5);doc.line(ML,y,PW-MR,y);y+=16;

    // ── Test Item ──
    sectionHdr('Test Item');
    const sizeStr=[ti.dimL&&ti.dimL+'"',ti.dimW&&ti.dimW+'"',ti.dimH&&ti.dimH+'"'].filter(Boolean).join(' x ');
    const pwrParts=[ti.volt&&ti.volt+' V '+(ti.pwrType||'AC'),ti.phase&&ti.phase+' Ph',ti.hz&&ti.hz+' Hz',ti.amps&&ti.amps+' A'].filter(Boolean);
    [['Unit',ti.item],['Dimensions',sizeStr],['Weight',ti.wt&&ti.wt+' lbs'],['Power',pwrParts.join(', ')]]
      .filter(r=>r[1]).forEach(([label,value],i)=>{
        doc.setFillColor(...(i%2===0?[255,255,255]:[247,248,250]));
        doc.rect(ML,y-2,TW,16,'F');
        setF('bold',9,MUTED);doc.text(label,ML+8,y+9);
        const valLines=doc.splitTextToSize(String(value),TW-112);
        setF('normal',9,DARK);doc.text(valLines,ML+110,y+9);
        y+=16;
      });
    y+=10;

    // ── Compute positions and test counts from calcEmiShifts ──
    const activeEmi = emiOverride ? {...emiOverride,on:true} : (emis.find(s=>s.on)||(emis[0]||{}));
    const dispL = activeEmi.dimL||ti.dimL||'0';
    const dispW = activeEmi.dimW||ti.dimW||'0';
    const dispH = activeEmi.dimH||ti.dimH||'0';
    const emiCalcG = calcEmiShifts({
      dimL:dispL, dimW:dispW, dimH:dispH,
      cables:activeEmi.cables||'0',
      setupCables:setup?.cables||'0',
      phases:activeEmi.phases||ti.phase||'3',
      revs:{'Rev G':true},
    });
    const c114 = emiCalcG.CS114;
    const c116 = emiCalcG.CS116;
    const re102p = emiCalcG.RE102.pos;
    const rs101p = emiCalcG.RS101.pos;
    const rs103p = emiCalcG.RS103.pos;
    const pos=(n)=>n+' position'+(n!==1?'s':'');

    // CS115: same cable structure as CS114 but fewer power tests (bulk + high side only = pwrCables)
    const cs115 = emiCalcG.CS115;
    const c109  = emiCalcG.CS109;

    // Full 461G test definitions
    const EMI_461G = [
      {key:"CE101", label:"Conducted Emissions, Audio Frequency Currents, Power Leads",
       desc:"Tested on each AC power input lead for a total of two (2) tests. Tested to MIL-STD-461G Figure CE101-2 from 120 Hz to 10 kHz with a relaxation to the limit determined during testing of 20xLog(fundamental current).",
       note:null},
      {key:"CE102", label:"Conducted Emissions, Radio Frequency Potentials, Power Leads",
       desc:"Tested on each AC power input lead for a total of two (2) tests. Tested to MIL-STD-461G Figure CE102-1 from 10 kHz to 10 MHz, basic curve relaxed by 6 dB.",
       note:null},
      {key:"CS101", label:"Conducted Susceptibility, Power Leads, 30 Hz to 150 kHz",
       desc:"Tested on the AC high side for a total of one (1) test. Tested to MIL-STD-461G Figure CS101-1 Curve 1 and Figure CS101-2 from 30 Hz to 150 kHz.",
       note:"Exempt from testing for normal operating current >30 A per phase, or if >30 A per phase with sensitivity worse than 1 uV or operating frequency >150 kHz."},
      {key:"CS109", label:"Conducted Susceptibility, Structure Current",
       desc:"Tested to MIL-STD-461G CS109 requirements.",
       note:"Test not applicable to equipment with an operating sensitivity worse than 1 uV or operating frequency >100 kHz."},
      {key:"CS114", label:"Conducted Susceptibility, Bulk Cable Injection, 10 kHz to 200 MHz and 4 kHz to 1 MHz at 77 dB uA",
       desc:"Bulk injection on AC power input and on the high side of the AC input leads. Common mode test on input leads for a total of "+c114.pwrTests+" tests for power leads. "+c114.sigTests+" test(s) on signal leads for a total of "+c114.totalTests+" tests. Tested to MIL-STD-461G Figure CS114-1, Curve 2 from 10 kHz to 200 MHz and from 4 kHz to 1 MHz at 77 dB uA.",
       note:null},
      {key:"CS115", label:"Conducted Susceptibility, Bulk Cable Injection, Impulse Excitation",
       desc:"Bulk injection on AC power input and on the high side individually for a total of "+cs115.pwrTests+" tests for power leads. "+cs115.sigTests+" test(s) on signal leads for a total of "+cs115.totalTests+" tests. Tested to MIL-STD-461G Figure CS115-1 for one minute using 30 ns pulse at 5 amps, 30 Hz.",
       note:null},
      {key:"CS116", label:"Conducted Susceptibility, Damped Sinusoidal Transients, Cables and Power Leads",
       desc:"Bulk injection on AC power input and on the high side and return individually for a total of "+c116.pwrTests+" tests for power leads. "+c116.sigTests+" test(s) on signal leads for a total of "+c116.totalTests+" tests. Tested at discrete frequencies: 10 kHz, 100 kHz, 1 MHz, 10 MHz, 30 MHz and 100 MHz.",
       note:null},
      {key:"RE101", label:"Radiated Emissions, Magnetic Field, 30 Hz to 100 kHz",
       desc:"Applicable to all enclosures including electrical cable interfaces. Tested to MIL-STD-461G Figure RE101-2 from 30 Hz to 100 kHz.",
       note:null},
      {key:"RE102", label:"Radiated Emissions, Electric Field, 10 kHz to 18 GHz",
       desc:"Tested to MIL-STD-461G Figure RE102-1 for Metallic Ships below deck applications.",
       positions:[
         {range:"10 kHz - 30 MHz",   pos:pos(1)},
         {range:"30 MHz - 200 MHz",  pos:pos(1)},
         {range:"200 MHz - 1 GHz",   pos:pos(re102p.sub1GHz)},
         {range:"1 GHz - 4 GHz",     pos:pos(re102p.b1_4)},
         {range:"4 GHz - 15 GHz",    pos:pos(re102p.b4_15)},
         {range:"15 GHz - 18 GHz",   pos:pos(re102p.b15_18)},
       ],
       note:"For 461G: tested in both horizontal and vertical polarizations. Testing required to 10x the highest operating frequency or 1 GHz (whichever is greater), or if not known, to 18 GHz."},
      {key:"RS101", label:"Radiated Susceptibility, Magnetic Field, 30 Hz to 100 kHz",
       desc:"Applicable to all equipment enclosures including electrical cable interfaces. Tested to MIL-STD-461G Figure RS101-1 from 30 Hz to 100 kHz at approximately "+rs101p.total+" positions ("+rs101p.LW+" LxW + "+rs101p.LH+" LxH + "+rs101p.WH+" WxH).",
       note:"Applicability depends on application. Test not applicable to equipment with an operating sensitivity worse than 1 uV or operating frequency >100 kHz."},
      {key:"RS103", label:"Radiated Susceptibility, Electric Field, 2 MHz to 18 GHz",
       desc:"Tested to MIL-STD-461G Ships metallic below deck from 2 MHz to 18 GHz at 10 V/m.",
       positions:[
         {range:"2 MHz - 30 MHz",    pos:pos(rs103p.b2_30)},
         {range:"30 MHz - 200 MHz",  pos:pos(rs103p.b30_200)},
         {range:"200 MHz - 1 GHz",   pos:pos(rs103p.b200_1G)},
         {range:"1 GHz - 4 GHz",     pos:pos(rs103p.b1_4)},
         {range:"4 GHz - 15 GHz",    pos:pos(rs103p.b4_15)},
         {range:"15 GHz - 18 GHz",   pos:pos(rs103p.b15_18)},
       ],
       note:null},
    ];

    // Only show tests selected by user
    const selectedKeys=new Set();
    if(emiOverride){
      Object.entries(emiOverride.tests||{}).forEach(([k,v])=>{if(v)selectedKeys.add(k);});
    } else {
      emis.filter(s=>s.on).forEach(s=>{
        Object.entries(s.tests||{}).forEach(([k,v])=>{if(v)selectedKeys.add(k);});
      });
    }
    const activeRows=EMI_461G.filter(r=>selectedKeys.has(r.key));

    if(activeRows.length===0){
      setF('normal',10,MUTED);doc.text('No MIL-STD-461G tests selected.',ML,y);y+=20;
    } else {
      sectionHdr('MIL-STD-461G -- Selected Tests');

      activeRows.forEach((r,idx)=>{
        const WRAP = TW - 20;
        doc.setFont('helvetica','bold'); doc.setFontSize(8.5);
        const lblLines  = doc.splitTextToSize(r.label, TW-54);
        doc.setFont('helvetica','normal'); doc.setFontSize(8.5);
        const descLines = r.desc ? doc.splitTextToSize(r.desc, WRAP) : [];
        doc.setFont('helvetica','italic'); doc.setFontSize(7.5);
        const noteLines = r.note ? doc.splitTextToSize('Note: '+r.note, WRAP) : [];
        doc.setFont('helvetica','normal'); doc.setFontSize(8);
        const posRows = r.positions ? r.positions.map(({range,pos})=>({
          rng: doc.splitTextToSize(range+':',120),
          pos: doc.splitTextToSize(pos, TW-160)
        })) : [];
        const posH = posRows.reduce((a,pr)=>a+Math.max(pr.rng.length,pr.pos.length)*12+2,0)+(posRows.length>0?4:0);
        const rowH = lblLines.length*14+8
          + (descLines.length>0 ? descLines.length*12+6 : 0)
          + posH
          + (noteLines.length>0 ? noteLines.length*12+6 : 0)
          + 10;
        checkY(rowH+2);

        doc.setFillColor(...(idx%2===0?[238,244,250]:[230,238,246]));
        doc.rect(ML,y,TW,lblLines.length*14+10,'F');
        doc.setFillColor(255,255,255);
        doc.rect(ML,y+lblLines.length*14+10,TW,rowH-(lblLines.length*14+10),'F');
        let ry = y+13;

        setF('bold',8.5,BLUE); doc.text(r.key,ML+6,ry);
        setF('bold',8.5,DARK); doc.text(lblLines,ML+52,ry);
        ry += lblLines.length*14+4;

        if(descLines.length>0){setF('normal',8.5,DARK);doc.text(descLines,ML+10,ry);ry+=descLines.length*12+6;}

        if(posRows.length>0){
          posRows.forEach(({rng,pos})=>{
            const h=Math.max(rng.length,pos.length)*12+2;
            setF('normal',8,[80,80,80]); doc.text(rng,ML+14,ry);
            setF('bold',8,DARK); doc.text(pos,ML+145,ry); ry+=h;
          });
          ry+=4;
        }

        if(noteLines.length>0){setF('italic',7.5,[110,85,40]);doc.text(noteLines,ML+10,ry);ry+=noteLines.length*12+5;}

        doc.setDrawColor(...LIGHT);doc.setLineWidth(0.4);
        doc.line(ML,y+rowH,ML+TW,y+rowH);
        y+=rowH;
      });
      y+=8;
    }

    // ── General Notes — force new page ──
    drawFooter();
    doc.addPage();
    y=54;
    sectionHdr('General Notes');
    y+=4;
    const generalNotes=[
      'Pricing is based on customer-supplied information and the assumptions listed herein.',
      'Feasibility of testing will be reviewed upon receipt of a purchase order and/or test procedure approval.',
      'EMI tested in accordance with MIL-STD-461G for Ships metallic below deck applications. Customer to supply cables and all peripheral and monitoring equipment, one mode of operation (operating or standby). Susceptibility determination provided by customer.',
      'Pricing and feasibility may be reevaluated upon completion and review of the NU Laboratories Test Configuration Form.',
      'The number of tests required for each test method and/or the number of test positions listed in this document are estimated values. Exact quantities will be determined and documented in the approved test procedure.',
    ];
    generalNotes.forEach((note,i)=>{
      const w=doc.splitTextToSize(note, TW-22);
      const blockH=w.length*13+10;
      checkY(blockH+4);
      doc.setFillColor(...LIGHT); doc.circle(ML+8,y+5,5,'F');
      setF('bold',8,MUTED); doc.text(String(i+1),ML+8,y+8,{align:'center'});
      setF('normal',9,DARK); doc.text(w, ML+20, y+8);
      y+=blockH;
    });
    y+=4;

    const tp=doc.internal.getNumberOfPages();
    for(let p=1;p<=tp;p++){doc.setPage(p);drawFooter();}
    const fname=(qi.opp?(qi.opp+' Test Specifications'):'EMI-461G-Test-Specifications')+'.pdf';
    await savePdfAs(doc, fname);
  };

  const exportPq300Part1PDF = async () => {
    if(window.jspdf){await buildPq300Part1PDF();return;}
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    script.onload = () => buildPq300Part1PDF();
    document.head.appendChild(script);
  };

  const buildPq300Part1PDF = async (pqOverride=null) => {
    const {jsPDF} = window.jspdf;
    const doc = new jsPDF({unit:"pt",format:"letter"});
    const PW = doc.internal.pageSize.getWidth();
    const PH = doc.internal.pageSize.getHeight();
    const ML = 54, MR = 54, TW = PW - ML - MR;
    const RED = [192,57,43], DARK = [30,30,30], MUTED = [100,100,100], LIGHT = [240,240,240], BLUE = [26,82,118];
    let y = 44;
    let pageNum = 1;

    const setF = (style, size, color) => {
      doc.setFont('helvetica', style);
      doc.setFontSize(size);
      doc.setTextColor(...(color||DARK));
    };
    const checkY = (need) => {
      if(y + (need||20) > PH - 52){
        drawFooter();
        doc.addPage();
        pageNum++;
        y = 54;
      }
    };
    const drawFooter = () => {
      const p = doc.internal.getCurrentPageInfo().pageNumber;
      setF('normal', 8, MUTED);
      doc.text('NU Laboratories, Inc. | '+(qi.opp||''), ML, PH-18);
      doc.text('Page '+p+' | '+(qi.revDate||qi.date||''), PW-MR, PH-18, {align:'right'});
      doc.setDrawColor(...LIGHT); doc.setLineWidth(0.5);
      doc.line(ML, PH-26, PW-MR, PH-26);
    };
    const sectionHdr = (title) => {
      checkY(28);
      y += 8;
      doc.setFillColor(...LIGHT);
      doc.rect(ML, y-2, TW, 18, 'F');
      doc.setFillColor(...RED); doc.rect(ML, y-2, 3, 18, 'F');
      setF('bold', 9, RED); doc.text(title.toUpperCase(), ML+10, y+10);
      y += 22;
    };

    // ── Header ──
    try { doc.addImage(NU_LOGO_PDF, 'PNG', ML, y, 180, 40); }
    catch(e) { setF('bold', 14, RED); doc.text('NU LABORATORIES', ML, y+28); }
    setF('normal', 8.5, DARK);
    ['312 Old Allerton Road','Annandale, NJ 08801-3206',
     'Tel: 908-713-9300 | Fax: 908-713-9001','sales@nulabs.com']
      .forEach((l,i) => doc.text(l, PW-MR, y+14+i*11, {align:'right'}));
    y += 54;
    doc.setDrawColor(...RED); doc.setLineWidth(1.5);
    doc.line(ML, y, PW-MR, y);
    y += 18;

    // ── Title ──
    setF('bold', 13, DARK); doc.text('POWER QUALITY', ML, y);
    setF('normal', 8.5, MUTED); doc.text('MIL-STD-1399 Section 300 Part 1 -- Test Specifications', ML, y+13);
    setF('normal', 9, MUTED); doc.text('Date: '+(qi.revDate||qi.date||''), PW-MR, y, {align:'right'});
    if(qi.opp){ setF('bold',9,DARK); doc.text(qi.opp, PW-MR, y+13, {align:'right'}); }
    y += 34;
    doc.setDrawColor(...LIGHT); doc.setLineWidth(0.5);
    doc.line(ML, y, PW-MR, y);
    y += 16;

    // ── Test Item ──
    sectionHdr('Test Item');
    const sizeStr = [ti.dimL&&ti.dimL+'"',ti.dimW&&ti.dimW+'"',ti.dimH&&ti.dimH+'"'].filter(Boolean).join(' x ');
    const pwrParts = [ti.volt&&ti.volt+' V '+(ti.pwrType||'AC'),ti.phase&&ti.phase+' Ph',ti.hz&&ti.hz+' Hz',ti.amps&&ti.amps+' A'].filter(Boolean);
    [['Unit',ti.item],['Dimensions',sizeStr],['Weight',ti.wt&&ti.wt+' lbs'],['Power',pwrParts.join(', ')]]
      .filter(r=>r[1]).forEach(([label,value],i)=>{
        doc.setFillColor(...(i%2===0?[255,255,255]:[247,248,250]));
        doc.rect(ML, y-2, TW, 16, 'F');
        setF('bold',9,MUTED); doc.text(label, ML+8, y+9);
        setF('normal',9,DARK); doc.text(String(value), ML+110, y+9);
        y += 16;
      });
    y += 10;

    // ── Part 1 test data ──
    const PQ_P1_FULL = [
      {key:"5.3.1", label:"Grounding (susceptibility) test",
       req:"100,000-ohm; each lead grounded individually for 5 minutes",
       ref:null, note:null},
      {key:"5.3.2", label:"User equipment power profile test",
       req:"User voltage and power characteristics per Section 5.3.2 a. through o. as required",
       ref:null,
       note:"Inrush current measurement may be limited by the capabilities of the AC source used, which may not cover 10x nominal current or higher. If inrush exceeds source capability the measurement cannot be made as desired. Will report what is measured and make a best effort attempt using facility power directly (5 attempts)."},
      {key:"5.3.3", label:"Voltage and frequency maximum departure tolerance test",
       req:"Type 1 single phase (127/104) VAC, (63/57) Hz or Type 1 single phase (484/396) VAC, (63/57) Hz",
       ref:"Table III for shipboard and submarine applications. Tested for 30 minutes in four (4) modes after temperature stability.",
       note:null},
      {key:"5.3.4", label:"Voltage and frequency transient tolerance and recovery test",
       req:"138 VAC / 63.3 Hz; 92 VAC / 56.7 Hz or 528 VAC / 63.3 Hz; 352 VAC / 56.7 Hz",
       ref:"Table IV, duration 2 seconds",
       note:null},
      {key:"5.3.5", label:"Voltage spike (susceptibility) test",
       req:"900 to 1000 V peak line-to-line and line-to-ground, or 2400 to 2500 V peak line-to-line and line-to-ground",
       ref:"Figure 28, 29 or 30",
       note:"Voltage spike impulse wave shape using IEC 61000-4-5 1.2/50 uS open circuit waveform definition. Overshoot may exceed figure. Or voltage spike impulse wave shape of Figure 6 NAVSEA deviation for light fixtures (MIL-DTL-16377 SSL)."},
      {key:"5.3.6", label:"Emergency conditions (susceptibility) test",
       req:"70 ms dropout, 2 minute dropout; voltage and frequency decay for half-load curve; 67.2 Hz for 2 min / 155.25 VAC for 2 min or 594 VAC for 2 min",
       ref:"Figure 9, Table VII",
       note:"Tc time to be provided by supplier, otherwise default times shall be used."},
      {key:"5.3.7", label:"Current waveform (emission) test",
       req:"Per Section 5.3.7, performed in accordance with CE101 testing",
       ref:null,
       note:"Requirement met using MIL-STD-461G test method CE101 with frequency extended to 20 kHz. A non-regulated power source may be needed as regulated source switching produces inconsistent current waveform data. Not required for currents < 1 A per NAVSEA."},
      {key:"5.3.8", label:"Voltage and frequency modulation (susceptibility) test",
       req:"Frequency modulation 0.5%; voltage modulation 2%. Periods of 50 ms, 500 ms, 1 s and 10 s each repeated ten consecutive times",
       ref:"Table VIII",
       note:null},
      {key:"5.3.9", label:"Simulated human body impedance ground current test",
       req:"60 Hz to 700 Hz < 5 mA; 700 Hz to 100 kHz < 70 mA",
       ref:"Figure 33 through Figure 36 depending on source voltage",
       note:null},
      {key:"5.3.10.1", label:"Equipment line-to-ground voltage (susceptibility) test",
       req:"150 VDC (for 115 VAC) or 500 VDC (for 440 VAC) for 60 seconds; resistance to ground > 10 MOhm",
       ref:null, note:null},
      {key:"5.3.10.2", label:"Equipment line-to-ground voltage test (AGD)",
       req:"For 440 V rms EUT: AC source 622.2 V peak, DC source 505 VDC. For 115 V rms EUT: AC source 162.6 V peak, DC source 155 VDC.",
       ref:null,
       note:"AGD is run on one line only per NAVSEA direction. Verify if legacy requirements apply."},
    ];

    // Only rows selected by user across all active PQ instances
    const selectedKeys = new Set();
    pqs.filter(s=>s.on).forEach(s=>{
      PQ_P1_FULL.forEach(r=>{ if(s.rows?.[r.key]) selectedKeys.add(r.key); });
    });
    const activeRows = PQ_P1_FULL.filter(r=>selectedKeys.has(r.key));

    if(activeRows.length===0){
      setF('normal',10,MUTED); doc.text('No MIL-STD-1399 Section 300 Part 1 tests selected.', ML, y); y+=20;
    } else {
      sectionHdr('MIL-STD-1399 Section 300 Part 1 -- Selected Tests');

      activeRows.forEach((r,idx)=>{
        const WRAP = TW - 20;
        doc.setFont('helvetica','bold'); doc.setFontSize(8.5);
        const hdrLines  = doc.splitTextToSize(r.key+' — '+r.label, WRAP);
        doc.setFont('helvetica','normal'); doc.setFontSize(8.5);
        const reqLines  = r.req ? doc.splitTextToSize(r.req, WRAP) : [];
        doc.setFont('helvetica','normal'); doc.setFontSize(8);
        const refLines  = r.ref ? doc.splitTextToSize('Tables / Figures: '+r.ref, WRAP) : [];
        doc.setFont('helvetica','italic'); doc.setFontSize(7.5);
        const noteLines = r.note ? doc.splitTextToSize('Note: '+r.note, WRAP) : [];
        const rowH = hdrLines.length*14+8
          + (reqLines.length>0 ? reqLines.length*12+6 : 0)
          + (refLines.length>0 ? refLines.length*11+5 : 0)
          + (noteLines.length>0 ? noteLines.length*12+6 : 0)
          + 10;

        checkY(rowH+2);
        doc.setFillColor(...(idx%2===0?[238,244,250]:[230,238,246]));
        doc.rect(ML, y, TW, hdrLines.length*13+10, 'F');
        doc.setFillColor(255,255,255);
        doc.rect(ML, y+hdrLines.length*13+10, TW, rowH-(hdrLines.length*13+10), 'F');

        let ry=y+12;
        setF('bold',8.5,BLUE); doc.text(hdrLines, ML+8, ry); ry+=hdrLines.length*14+4;
        if(reqLines.length>0){ setF('normal',8.5,DARK); doc.text(reqLines, ML+10, ry); ry+=reqLines.length*12+6; }
        if(refLines.length>0){ setF('normal',8,MUTED); doc.text(refLines, ML+10, ry); ry+=refLines.length*11+5; }
        if(noteLines.length>0){ setF('italic',7.5,[110,85,40]); doc.text(noteLines, ML+10, ry); ry+=noteLines.length*12+5; }

        doc.setDrawColor(...LIGHT); doc.setLineWidth(0.4);
        doc.line(ML, y+rowH, ML+TW, y+rowH);
        y += rowH;
      });
      y += 8;
    }

    // ── General Notes — force new page ──
    drawFooter();
    doc.addPage();
    y=54;
    sectionHdr('General Notes');
    y+=4;
    const generalNotes = [
      'Pricing is based on customer-supplied information and the assumptions listed herein.',
      'Feasibility of testing will be reviewed upon receipt of a purchase order and/or test procedure approval.',
      'The number of tests required for each test method and/or the number of test positions listed in this document are estimated values. Exact quantities will be determined and documented in the approved test procedure.',
    ];
    generalNotes.forEach((note,i)=>{
      const w=doc.splitTextToSize(note, TW-22);
      const blockH=w.length*13+10;
      checkY(blockH+4);
      doc.setFillColor(...LIGHT); doc.circle(ML+8,y+5,5,'F');
      setF('bold',8,MUTED); doc.text(String(i+1),ML+8,y+8,{align:'center'});
      setF('normal',9,DARK); doc.text(w, ML+20, y+8);
      y+=blockH;
    });
    y+=4;

    const fname=(qi.opp?(qi.opp+' Test Specifications'):'PQ-300-Part1-Test-Specifications')+'.pdf';
    await savePdfAs(doc, fname);
  };

  const buildPDF = async (budgetOnly) => {
    const {jsPDF} = window.jspdf||{};
    if(!jsPDF){console.error('jsPDF not loaded');return;}
    const doc = new jsPDF({unit:"pt",format:"letter"});
    const PW = doc.internal.pageSize.getWidth();   // 612
    const PH = doc.internal.pageSize.getHeight();  // 792
    const ML = 54, MR = 54, TW = PW - ML - MR;
    const RED = [192,57,43], DARK = [30,30,30], MUTED = [100,100,100], LIGHT = [240,240,240];
    let y = 44;
    let pageNum = 1;

    // ── helpers ──────────────────────────────────────────────────────────────
    const sf2 = v => { const n = parseFloat(String(v).replace(/,/g,'')); return isNaN(n)?0:n; };
    const money = v => '$'+Math.round(sf2(v)).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});

    const setF = (style, size, color) => {
      doc.setFont('helvetica', style);
      doc.setFontSize(size);
      doc.setTextColor(...(color||DARK));
    };

    const totalPages = () => doc.internal.getNumberOfPages();

    const drawFooter = () => {
      const p = doc.internal.getCurrentPageInfo().pageNumber;
      setF('normal', 8, MUTED);
      doc.text('NU Laboratories, Inc. | '+(qi.opp||''), ML, PH-18);
      doc.text('Page '+p+' | '+(qi.revDate||qi.date||''), PW-MR, PH-18, {align:'right'});
      doc.setDrawColor(...LIGHT); doc.setLineWidth(0.5);
      doc.line(ML, PH-26, PW-MR, PH-26);
    };

    const checkY = (need) => {
      if (y + (need||20) > PH - 52) {
        drawFooter();
        doc.addPage();
        pageNum++;
        y = 54;
      }
    };

    // Left-column bold label, right-column normal value
    const kvRow = (label, value) => {
      if (!value && value !== 0) return;
      checkY(16);
      setF('bold', 9.5, DARK);
      doc.text(String(label), ML, y);
      setF('normal', 9.5, DARK);
      const vlines = doc.splitTextToSize(String(value), TW - 120);
      doc.text(vlines, ML + 120, y);
      y += Math.max(14, vlines.length * 13);
    };

    // Red left-border section heading in a light gray band
    const sectionHdr = (title) => {
      checkY(30);
      y += 10;
      doc.setFillColor(...LIGHT);
      doc.rect(ML, y - 10, TW, 20, 'F');
      doc.setFillColor(...RED);
      doc.rect(ML, y - 10, 3, 20, 'F');
      setF('bold', 9, RED);
      doc.text(title.toUpperCase(), ML + 10, y + 4);
      y += 16;
    };

    // ── PAGE 1 ──────────────────────────────────────────────────────────────

    if(!budgetOnly) {
    // Logo
    try { doc.addImage(NU_LOGO_PDF, 'PNG', ML, y, 180, 40); }
    catch(e) { setF('bold', 14, RED); doc.text('NU LABORATORIES', ML, y+28); }

    // Address block top-right
    setF('normal', 8.5, DARK);
    ['312 Old Allerton Road','Annandale, NJ 08801-3206',
     'Tel: 908-713-9300 | Fax: 908-713-9001','sales@nulabs.com']
      .forEach((l,i) => doc.text(l, PW-MR, y+14+i*11, {align:'right'}));
    y += 54;

    // Red rule under header
    doc.setDrawColor(...RED); doc.setLineWidth(1.5);
    doc.line(ML, y, PW-MR, y);
    y += 16;

    // Quote # and date
    setF('bold', 16, DARK);
    doc.text('Quote #'+(qi.opp||''), ML, y);
    setF('normal', 10, MUTED);
    doc.text('Date: '+(qi.revDate||qi.date||''), PW-MR, y, {align:'right'});
    y += 24;

    if(true) {
      // ── QUOTE INFORMATION ────────────────────────────────────────────────
      sectionHdr('Quote Information');
      y += 4;
      [['Opportunity', qi.opp],
       ['Stage', qi.stage],
       ['Type', qi.type],
       ['Date', qi.revDate||qi.date],
       qi.account&&['Account', qi.account],
       qi.contact&&['Contact', qi.contact],
       qi.rfq&&['RFQ', qi.rfq],
      ].filter(Boolean).filter(r=>r[1]).forEach(([l,v])=>kvRow(l,v));
      y += 6;

      // ── TEST ITEM DESCRIPTION ────────────────────────────────────────────
      sectionHdr('Test Item Description');
      y += 4;
      const sizeStr=[ti.dimL&&ti.dimL+'"',ti.dimW&&ti.dimW+'"',ti.dimH&&ti.dimH+'"'].filter(Boolean).join(' x ');
      const pwrParts=[ti.volt&&ti.volt+' V '+(ti.pwrType||'AC'),ti.phase&&ti.phase+' Ph',ti.hz&&ti.hz+' Hz',ti.amps&&ti.amps+' A'].filter(Boolean);
      [
        ti.item&&['Test Item', ti.item],
        ti.qty&&ti.qty!=='1'&&['Qty', ti.qty],
        ti.model&&['Model No.', ti.model],
        ti.drawing&&['Drawing No.', ti.drawing],
        sizeStr&&['Size', sizeStr],
        ti.wt&&['Weight', ti.wt+' lbs'],
        pwrParts.length&&['Power', pwrParts.join(', ')],
        (ti.loads!==''&&(ti.loads!=null||qi.account))&&['Loads', ti.loads!=null&&ti.loads!==''?ti.loads:(qi.account?'All electrical and/or resistive loads will be provided by '+qi.account+' unless otherwise discussed.':'')],
        ti.mounting&&['Mounting', ti.mounting],
        ti.pressureFlow&&['Pressure/Flow', ti.pressureFlow],
      ].filter(Boolean).filter(r=>r[1]).forEach(([l,v])=>kvRow(l,v));

      // GSI bar — always 2 rows: row1: GSI | Witness  row2: Doc Restriction | DPAS
      checkY(42);
      y += 6;
      doc.setFillColor(232,236,240);
      doc.rect(ML, y-2, TW, 30, 'F');
      setF('bold', 9, DARK);
      const gsiHalf = TW / 2;
      doc.text('GSI: '+(ti.gsi||'Unknown'), ML+6, y+10);
      doc.text('Customer Witness: '+(ti.witness||'Unknown'), ML+gsiHalf+6, y+10);
      doc.text('Document Restriction: '+(ti.docRestriction||'None'), ML+6, y+22);
      doc.text('DPAS: '+(ti.dpas||'None'), ML+gsiHalf+6, y+22);
      y += 34;

      // ── SPECIFICATIONS & NOTES ───────────────────────────────────────────
      // Use snapshot specs/notes when not dirty — immune to auto-note formula changes
      const specsText = (!isDirty&&snapshot?.tiSpecs!=null ? snapshot.tiSpecs : (ti.tiSpecs||"")).trim();
      const notesText = (!isDirty&&snapshot?.tiNotes!=null ? snapshot.tiNotes : (ti.tiNotes||"")).trim();
      if(specsText||notesText){
        sectionHdr('Specifications & Notes');
        y += 4;
        if(specsText){
          setF('bold', 9.5, DARK); checkY(14); doc.text('Specifications:', ML, y); y += 13;
          setF('normal', 9, DARK);
          specsText.split('\n').forEach(line=>{
            if(!line.trim()){y+=4;return;}
            const bullet = line.startsWith('•') ? '' : '';
            const w = doc.splitTextToSize('• '+line.replace(/^•s*/,''), TW-14);
            checkY(w.length*12+3);
            doc.text(w, ML+8, y); y += w.length*12+3;
          });
          y += 4;
        }
        if(notesText){
          setF('bold', 9.5, DARK); checkY(14); doc.text('Notes:', ML, y); y += 13;
          setF('normal', 9, DARK);
          notesText.split('\n').forEach(line=>{
            if(!line.trim()){y+=4;return;}
            const isSubBullet = line.startsWith('  ') || line.startsWith('\t');
            const indent = isSubBullet ? 20 : 8;
            const w = doc.splitTextToSize('• '+line.replace(/^•s*/,'').replace(/^\s+/,''), TW-indent-6);
            checkY(w.length*12+3);
            doc.text(w, ML+indent, y); y += w.length*12+3;
          });
          y += 4;
        }
        y += 4;
      }

      // ── Intro paragraph ───────────────────────────────────────────────────
      checkY(44);
      y += 4;
      setF('normal', 9, DARK);
      const intro = 'Pursuant to your request, we are pleased to offer the following quotation. All pricing is subject to the attached terms and conditions. Any additional terms and conditions must be clearly defined in writing and may be subject to negotiation. This quote is based on the following:';
      const iw = doc.splitTextToSize(intro, TW);
      checkY(iw.length*12+8);
      doc.text(iw, ML, y); y += iw.length*12+12;

      // ── PRICING SUMMARY ───────────────────────────────────────────────────
      sectionHdr('Pricing Summary');
      y += 4;

      // Table header row
      const cQty=28, cCode=36, cAmt=90, cDesc=TW-cQty-cCode-cAmt;
      doc.setFillColor(50,50,50);
      doc.rect(ML, y, TW, 16, 'F');
      setF('bold', 8.5, [255,255,255]);
      doc.text('Qty', ML+cQty/2, y+11, {align:'center'});
      doc.text('Code', ML+cQty+4, y+11);
      doc.text('Description', ML+cQty+cCode+4, y+11);
      doc.text('Amount', PW-MR-4, y+11, {align:'right'});
      y += 16;

      const drawTblHdr = () => {
        doc.setFillColor(50,50,50);
        doc.rect(ML, y, TW, 16, 'F');
        setF('bold', 8.5, [255,255,255]);
        doc.text('Qty', ML+cQty/2, y+11, {align:'center'});
        doc.text('Code', ML+cQty+4, y+11);
        doc.text('Description', ML+cQty+cCode+4, y+11);
        doc.text('Amount', PW-MR-4, y+11, {align:'right'});
        y += 16;
      };

      // Use snapshot lines when not dirty — prices frozen at last save
      // Use summary.lines for ORDER (matches sidebar/lineOrder)
      // Use snapshot prices by label for data integrity
      const snapPriceByLabel={};
      if(!isDirty&&snapshot?.lines?.length>0){
        snapshot.lines.forEach(l=>{ snapPriceByLabel[l.label]=l.val; });
      }
      const pdfLines = summary.lines;
      const order = lineOrder&&lineOrder.length===pdfLines.length ? lineOrder : pdfLines.map((_,i)=>i);
      // Override lookup
      const pdfLabelCount={};
      summary.lines.forEach(l=>{ pdfLabelCount[l.label]=(pdfLabelCount[l.label]||0)+1; });
      const pdfOvByLabel={};
      Object.entries(lineOverrides).forEach(([k,ov])=>{
        if(ov.label&&pdfLabelCount[ov.label]===1) pdfOvByLabel[ov.label]=ov;
      });
      summary.lines.forEach((l,i)=>{
        const ov=lineOverrides[i];
        if(ov&&!ov.label&&pdfLabelCount[l.label]===1) pdfOvByLabel[l.label]={...ov,label:l.label};
      });
      const pdfOvByIndex={};
      Object.entries(lineOverrides).forEach(([k,ov])=>{ pdfOvByIndex[k]=ov; });
      // Build auto and picker row pools
      const autoRowPool = order.map((origIdx,dispIdx)=>{
        const l=pdfLines[origIdx]; if(!l)return null;
        const ov=pdfOvByIndex[origIdx]||pdfOvByLabel[l.label]||{};
        if(ov.deleted)return null;
        const price=snapPriceByLabel[l.label]!==undefined?snapPriceByLabel[l.label]:l.val;
        const desc=ov.desc&&ov.desc.trim()?ov.desc.trim():null;
        return {type:'auto',origIdx,l,price,desc,dispIdx};
      }).filter(Boolean);
      const pickerRowPool=(pickerLines||[]).map((pl,pli)=>({type:'picker',pl,pli,id:pl.id||pl.label}));
      // Use unifiedOrder if available — matches sidebar exactly
      let allRows;
      if(unifiedOrder&&unifiedOrder.length===(autoRowPool.length+pickerRowPool.length)){
        allRows=unifiedOrder.map(u=>{
          if(u.type==='auto') return autoRowPool.find(r=>r.origIdx===u.origIdx);
          else return pickerRowPool.find(r=>(r.pl.id||r.pl.label)===(u.id||u.label));
        }).filter(Boolean);
        if(allRows.length!==autoRowPool.length+pickerRowPool.length)
          allRows=null; // fallback if any mismatch
      }
      if(!allRows){
        // No unifiedOrder — same order as sidebar: auto lines then picker lines
        // Both groups preserve their internal order (lineOrder / pickerLines array)
        allRows=[...autoRowPool,...pickerRowPool];
      }
      allRows.forEach((row, allIdx) => {
        const bg = allIdx%2===0 ? [255,255,255] : [247,248,250];
        if(row.type==='auto'){
          const {l, price, desc} = row;
          const rowH = desc ? 26 : 14;
          if(y + rowH + 2 > PH-52){ drawFooter(); doc.addPage(); pageNum++; y=54; drawTblHdr(); }
          doc.setFillColor(...bg); doc.rect(ML, y, TW, rowH, 'F');
          setF('normal', 9, DARK);
          doc.text('1', ML+cQty/2, y+10, {align:'center'});
          if(l.code){ setF('normal',8,MUTED); doc.text(String(l.code), ML+cQty+4, y+10); }
          setF('normal', 9, DARK); doc.text(l.label, ML+cQty+cCode+4, y+10);
          if(desc){
            setF('italic', 7.5, [130,130,130]);
            const dw = doc.splitTextToSize(desc, cDesc-10);
            doc.text(dw, ML+cQty+cCode+4, y+19);
          }
          setF('bold', 9, DARK); doc.text(money(price), PW-MR-4, y+10, {align:'right'});
          y += rowH;
        } else {
          const {pl} = row;
          const desc = pl.desc&&pl.desc.trim() ? pl.desc.trim() : null;
          const rowH = desc ? 26 : 14;
          if(y + rowH + 2 > PH-52){ drawFooter(); doc.addPage(); pageNum++; y=54; drawTblHdr(); }
          doc.setFillColor(...bg); doc.rect(ML, y, TW, rowH, 'F');
          setF('normal', 9, DARK);
          doc.text('1', ML+cQty/2, y+10, {align:'center'});
          if(pl.code){ setF('normal',8,MUTED); doc.text(String(pl.code), ML+cQty+4, y+10); }
          setF('normal', 9, DARK);
          const labelLines = doc.splitTextToSize(pl.label||'', cDesc-10);
          doc.text(labelLines, ML+cQty+cCode+4, y+10);
          if(desc){
            setF('italic', 7.5, [130,130,130]);
            const dw = doc.splitTextToSize(desc, cDesc-10);
            doc.text(dw, ML+cQty+cCode+4, y+19);
          }
          setF('bold', 9, DARK); doc.text(money(pl.price||0), PW-MR-4, y+10, {align:'right'});
          y += rowH;
        }
      });

      // Total row
      checkY(28);
      y += 4;
      doc.setDrawColor(...RED); doc.setLineWidth(1); doc.line(ML, y, PW-MR, y); y += 1;
      doc.setFillColor(245,245,245); doc.rect(ML, y, TW, 20, 'F');
      setF('bold', 11, DARK);
      doc.text('TOTAL', ML+cQty+cCode+4, y+14);
      const pickerTotal = (pickerLines||[]).reduce((a,l)=>a+(l.price||0),0);
      const total = pickerTotal + summary.lines.reduce((a,l,idx)=>{
        const ov=lineOverrides[idx]||{};
        if(ov.deleted)return a;
        return a+(ov.price!==undefined?sf2(ov.price):l.val);
      },0);
      setF('bold', 11, DARK);
      doc.text(money(total), PW-MR-4, y+14, {align:'right'});
      y += 26;

      // ── TERMS & CONDITIONS — force new page ──────────────────────────────
      drawFooter();
      doc.addPage();
      y = 54;

      // T&C header bar
      doc.setFillColor(...RED); doc.rect(ML,y-2,TW,24,'F');
      setF('bold',13,[255,255,255]); doc.text('NOTES',ML+10,y+13); y+=32;

      const TERMS = [
        "All work to be performed during normal business hours unless specifically noted on this quote.",
        "Customer is to supply all installation hardware, cables, hoses, mating connections for power or fluid, electrical/resistive and dummy loads, and specialized monitoring equipment/peripheral equipment unless other arrangements with NU Laboratories, Inc. have been made. No functional testing shall be performed by NU Laboratories or its personnel unless specifically addressed in our quotation.",
        "All equipment, including the UUT, support equipment, test fixtures, mounting brackets, etc. are to be delivered to NU Laboratories no later than (5) business days prior to the scheduled testing start date.",
        "Return shipping arrangements are to be provided prior to the start of testing. If not, storage charges will apply beginning (5) business days after testing is completed.",
        "If applicable, all import and export documentation is to be provided by the customer.",
        "Out-of-scope work, including additional efforts and standby charges are to be determined at NU Laboratories' discretion and will be quoted separately.",
        "This quote does not guarantee a specific testing schedule, nor does it represent a fixed number of testing days. Scheduling will be secured with the receipt of a purchase order and/or test procedure approval.",
        "Testing duration may be affected by factors such as equipment malfunctions or failures, delays in the delivery of customer-supplied equipment, or other unforeseen issues. Such circumstances may result in additional charges.",
        "Delays caused by NU Laboratories--including, but not limited to, the unavailability of test equipment or personnel--will not result in charges to the customer. However, such delays will not entitle the customer to any discounts, refunds, or price reductions.",
        "The provided quote is based on a pass scenario and does not account for any additional time required due to test item malfunctions or failures. Should the customer's representative request a retest or engineering evaluation, a separate quote will be issued.",
        "Any requested lead times are estimated and may be subject to change.",
        "This quote is based on a total purchase and is good for a period of 90 days.",
        "All mounting hardware is assumed to be supplied by the customer. If NU Laboratories is asked to supply mounting hardware, it is assumed to be SAE Grade 5. Any other material hardware will be quoted separately and specifically noted within the quote. If no notes pertaining to the type of hardware are present on the quote, the quote reflects Grade 5 hardware. All fixturing provided by NU Laboratories is assumed to be A36 Steel. All other hardware and fixture requirements will be quoted separately if not detailed in this quote.",
      ];
      TERMS.forEach((t,i) => {
        const w = doc.splitTextToSize(t, TW-20);
        const blockH = w.length*11+5;
        checkY(blockH+3);
        doc.setFillColor(...LIGHT); doc.circle(ML+7, y+3, 5, 'F');
        setF('bold',7,MUTED); doc.text(String(i+1), ML+7, y+6, {align:'center'});
        setF('normal', 8, DARK); doc.text(w, ML+18, y+6);
        y += blockH;
      });
      y += 10;

      // ── GOVERNMENT SOURCE INSPECTION ─────────────────────────────────────
      checkY(70);
      doc.setFillColor(...LIGHT); doc.rect(ML,y-2,TW,18,'F');
      doc.setFillColor(...RED); doc.rect(ML,y-2,3,18,'F');
      setF('bold',9,RED); doc.text('GOVERNMENT SOURCE INSPECTION',ML+10,y+10); y+=26;
      setF('normal', 9, DARK);
      doc.text('If Government Source Inspection is required:', ML, y); y += 14;
      [['Navy Nuclear','Michael Auchenbach -- michael.a.auchenbach.civ@mail.mil -- T: 908-387-9866  F: 908-387-8694'],
       ['Non-Nuclear','Tyson Rounsaville, QAR -- tyson.rounsaville.civ@mail.mil -- T: 973-891-3850  F: 973-446-4236'],
      ].forEach(([k,v]) => {
        checkY(18);
        setF('bold',9,DARK); const kw=doc.getTextWidth('* '+k+': ');
        doc.text('* '+k+': ', ML+4, y);
        setF('normal',9,DARK);
        const vw=doc.splitTextToSize(v, TW-kw-10);
        doc.text(vw, ML+4+kw, y); y += vw.length*12+6;
      });
      y += 12;

      // ── Closing paragraphs ───────────────────────────────────────────────
      const closingParas = [
        'This is a line item quote. Please have your purchase order reflect each line item and our quote number. Please send the signed Terms and Conditions page and Purchase Orders to Fax: 908-713-9001 or e-mail: sales@nulabs.com, attention Jordan McAdoo.',
        'We appreciate this opportunity to quote on your testing requirements. In the event that we receive a purchase order for the above testing, please acknowledge the enclosed terms and conditions and return with your order. Should you have further questions, please feel free to contact us.',
      ];
      setF('normal', 9, DARK);
      closingParas.forEach(t => {
        const w = doc.splitTextToSize(t, TW);
        checkY(w.length*12+10);
        doc.text(w, ML, y); y += w.length*12+10;
      });

      // ── Signature block ──────────────────────────────────────────────────
      checkY(90); y += 16;
      setF('normal', 8.5, MUTED); doc.text('Submitted by:', ML, y); y += 6;
      // Real signature image — aspect ratio ~1330/630 ≈ 2.1:1, render at 140pt wide
      try { doc.addImage(JORDAN_SIG_PDF,'PNG',ML,y,140,66); }
      catch(e) { setF('italic',18,DARK); doc.text('Jordan McAdoo',ML,y+40); }
      y += 70;
      setF('bold', 9, DARK); doc.text('Jordan McAdoo', ML, y); y += 13;
      setF('normal', 8.5, MUTED); doc.text('Sales Manager, NU Laboratories, Inc.', ML, y);

    }} // end if(!budgetOnly)

    // ── BUDGET PDF ────────────────────────────────────────────────────────
    if(budgetOnly&&budget.on&&budget.rows.length>0){
      // Logo
      try { doc.addImage(NU_LOGO_PDF, 'PNG', ML, y, 180, 40); }
      catch(e) { setF('bold', 14, RED); doc.text('NU LABORATORIES', ML, y+28); }
      // Address top-right
      setF('normal', 8.5, DARK);
      ['312 Old Allerton Road','Annandale, NJ 08801-3206',
       'Tel: 908-713-9300 | Fax: 908-713-9001','sales@nulabs.com']
        .forEach((l,i) => doc.text(l, PW-MR, y+14+i*11, {align:'right'}));
      y += 54;
      doc.setDrawColor(...RED); doc.setLineWidth(1.5);
      doc.line(ML, y, PW-MR, y);
      y += 16;
      // Title
      setF('bold', 16, RED); doc.text('BUDGET MATERIALS', ML, y); y += 4;
      setF('normal', 9, MUTED); doc.text('Date: '+(qi.revDate||qi.date||''), PW-MR, y-10, {align:'right'});
      if(qi.opp){ setF('normal',9,DARK); doc.text('Opportunity: ',ML,y+6); setF('bold',9,DARK); doc.text(qi.opp,ML+55,y+6); y+=20; }
      else{ y+=14; }
      // Internal notes
      const bNotes=(budget.notes||'').trim();
      if(bNotes){
        checkY(20); setF('bold',8.5,DARK); doc.text('Internal Notes:',ML,y); y+=11;
        setF('normal',8.5,[80,80,80]);
        bNotes.split('\n').forEach(line=>{if(!line.trim()){y+=4;return;}const w=doc.splitTextToSize(line,TW-6);checkY(w.length*11+2);doc.text(w,ML+4,y);y+=w.length*11+2;});
        y+=8;
      }
      y += 6;
      const mp=sf2(budget.markup||25)/100;
      const hardTot=budget.rows.reduce((s,r)=>s+sf2(r.qty||1)*sf2(r.unitCost||0),0);
      doc.setFillColor(50,50,50); doc.rect(ML,y,TW,16,'F');
      setF('bold',8.5,[255,255,255]);
      const bDesc=TW*0.44,bQty=TW*0.08,bUC=TW*0.16,bHC=TW*0.16,bMU=TW*0.16;
      let bx=ML;
      doc.text('Part / Description',bx+4,y+11);bx+=bDesc;
      doc.text('Qty',bx+bQty/2,y+11,{align:'center'});bx+=bQty;
      doc.text('Unit Cost',bx+4,y+11);bx+=bUC;
      doc.text('Hard Cost',bx+4,y+11);bx+=bHC;
      doc.text('w/ Markup',bx+4,y+11);
      y+=16;
      budget.rows.forEach((r,idx)=>{
        checkY(14);
        doc.setFillColor(...(idx%2===0?[255,255,255]:[247,248,250]));
        doc.rect(ML,y,TW,14,'F');
        setF('normal',8.5,DARK);
        bx=ML;
        const hardCost=sf2(r.qty||1)*sf2(r.unitCost||0);
        const markedUp=Math.round(hardCost*(1+mp));
        const dw=doc.splitTextToSize(r.desc||'',bDesc-8);
        doc.text(dw,bx+4,y+10);bx+=bDesc;
        doc.text(String(r.qty||'1'),bx+bQty/2,y+10,{align:'center'});bx+=bQty;
        doc.text('$'+sf2(r.unitCost||0).toLocaleString(),bx+4,y+10);bx+=bUC;
        setF('bold',8.5,DARK);doc.text('$'+Math.round(hardCost).toLocaleString(),bx+4,y+10);bx+=bHC;
        setF('bold',8.5,RED);doc.text('$'+markedUp.toLocaleString(),bx+4,y+10);
        y+=Math.max(14,dw.length*11+3);
      });
      checkY(18);
      doc.setFillColor(232,236,240);doc.rect(ML,y,TW,16,'F');
      doc.setDrawColor(...RED);doc.setLineWidth(0.5);doc.line(ML,y,PW-MR,y);
      setF('bold',8.5,DARK);
      bx=ML+bDesc+bQty;
      doc.text('Markup: '+Math.round(sf2(budget.markup||25))+'%',bx+4,y+11);
      bx+=bUC;
      doc.text('$'+Math.round(hardTot).toLocaleString(),bx+4,y+11);
      bx+=bHC;
      setF('bold',8.5,RED);doc.text('$'+Math.round(hardTot*(1+mp)).toLocaleString(),bx+4,y+11);
      y+=22;
    }

    // footers on all pages
    const tp = doc.internal.getNumberOfPages();
    for(let p=1;p<=tp;p++){ doc.setPage(p); drawFooter(); }

    const fname=((qi.opp)||'Quote')+(budgetOnly?' Budget':'')+'.pdf';
    await savePdfAs(doc, fname);
  };


  return(
    <div style={{height:"100vh",background:C.bg,fontFamily:"Segoe UI,system-ui,sans-serif",color:C.text,display:"flex",flexDirection:"column",fontSize:13}}>

      {/* ── Header ── */}
      <div style={{background:C.accent,flexShrink:0,boxShadow:"0 2px 8px rgba(0,0,0,0.15)"}}>
        <div style={{padding:"9px 18px",display:"flex",alignItems:"center",gap:10}}>
        <div style={{background:"#fff",borderRadius:20,padding:"4px 12px",display:"flex",alignItems:"center",justifyContent:"center",height:36}}>
                  <img src="data:image/png;base64,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" alt="NU Laboratories" style={{height:28,width:"auto",objectFit:"contain"}}/>
                </div>
          <div style={{fontWeight:700,fontSize:13,letterSpacing:1,color:"rgba(255,255,255,0.5)",marginLeft:4}}>VIBRATO</div>
          <div style={{flex:1}}/>
          <button onClick={()=>navigateTo(true)}
            title="Go to dashboard"
            style={{background:showDashboard?"rgba(255,255,255,0.2)":"none",border:"1px solid rgba(255,255,255,0.25)",
              borderRadius:6,padding:"5px 12px",color:"#fff",fontSize:11,cursor:"pointer",fontWeight:600}}>
            🏠 Home
          </button>
          <QuoteSearch onLoad={q=>{handleLoad(q);navigateTo(false);}}/>

          {!showDashboard&&<button onClick={handleClone} title="Clone this quote"
            style={{background:"#2e6da4",border:"none",borderRadius:7,padding:"7px 14px",color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer",letterSpacing:.5}}>
            CLONE
          </button>}

          {!showDashboard&&<button onClick={handleSave}
            style={{background:C.red,border:"none",borderRadius:7,padding:"7px 16px",color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer",letterSpacing:.5}}>
            SAVE
          </button>}


          <div style={{width:1,height:22,background:"rgba(255,255,255,0.2)"}}/>
          {currentUser&&<div style={{fontSize:10,color:"rgba(255,255,255,0.55)"}}>{currentUser}</div>}
          {currentQuoteId&&<button onClick={handleDeleteQuote} title="Delete this quote"
            style={{background:"none",border:"1px solid rgba(255,100,100,0.4)",borderRadius:6,padding:"5px 8px",
              color:"rgba(255,160,160,0.8)",fontSize:11,cursor:"pointer"}}>
            🗑
          </button>}
          {onLogout&&<button onClick={onLogout}
            style={{background:"none",border:"1px solid rgba(255,255,255,0.25)",borderRadius:6,padding:"5px 10px",
              color:"rgba(255,255,255,0.6)",fontSize:11,cursor:"pointer"}}>
            Sign out
          </button>}
        </div>
        {/* Row 2: approval bar — hidden on dashboard */}
        {!showDashboard&&(
          <div style={{background:"rgba(0,0,0,0.18)",padding:"5px 18px",display:"flex",alignItems:"center",gap:8,borderTop:"1px solid rgba(255,255,255,0.07)"}}>
            {approval.status!=="none"&&(
              <div style={{borderRadius:5,padding:"3px 10px",fontWeight:700,fontSize:11,letterSpacing:.5,flexShrink:0,
                background:approval.status==="pending"?"#b7791f":approval.status==="approved"?"#1e8449":"#c0392b",color:"#fff"}}>
                {approval.status==="pending"&&"PENDING APPROVAL"}
                {approval.status==="approved"&&"APPROVED"}
                {approval.status==="rejected"&&"REJECTED"}
              </div>
            )}
            {approval.status!=="none"&&(approval.history||[]).length>0&&(
              <button onClick={()=>setShowApprovalHistory(true)}
                title="View approval history"
                style={{background:"rgba(255,255,255,0.12)",border:"1px solid rgba(255,255,255,0.2)",
                  borderRadius:5,padding:"3px 10px",color:"#fff",fontSize:11,cursor:"pointer",fontWeight:600}}>
                📋 History
              </button>
            )}
            {(approval.status==="none"||approval.status==="rejected"||(approval.status==="approved"&&!locked))&&(
              <button onClick={()=>setShowApprovalModal(true)}
                style={{background:"#6d28d9",border:"none",borderRadius:6,padding:"4px 12px",
                  color:"#fff",fontWeight:700,fontSize:11,cursor:"pointer",letterSpacing:.5}}>
                📋 {approval.status==="approved"&&!locked?"RE-SUBMIT":"SUBMIT"}
              </button>
            )}
            {qi.stage==="Closed Won"&&wonApproval.status==="none"&&(
              <button onClick={handleSubmitWonApproval}
                style={{background:"#1e8449",border:"none",borderRadius:6,padding:"4px 12px",
                  color:"#fff",fontWeight:700,fontSize:11,cursor:"pointer",letterSpacing:.5}}>
                🏆 SUBMIT WON
              </button>
            )}
            {qi.stage==="Closed Won"&&wonApproval.status==="pending_won"&&(
              <div style={{background:"rgba(30,132,73,0.15)",borderRadius:5,padding:"3px 10px",
                fontSize:11,fontWeight:700,color:"#145a32"}}>
                🏆 WON PENDING
              </div>
            )}
            {qi.stage==="Closed Won"&&wonApproval.status==="won_approved"&&(
              <div style={{background:"rgba(30,132,73,0.15)",borderRadius:5,padding:"3px 10px",
                fontSize:11,fontWeight:700,color:"#145a32"}}>
                ✅ WON APPROVED
              </div>
            )}
            {isApprover&&approval.status==="pending"&&(
              <>
                <button onClick={handleApproverUnlock}
                  style={{background:"#b7791f",border:"none",borderRadius:6,padding:"4px 10px",color:"#fff",fontWeight:700,fontSize:11,cursor:"pointer"}}>
                  ✏️ EDIT
                </button>
                <button onClick={handleApprove}
                  style={{background:"#1e8449",border:"none",borderRadius:6,padding:"4px 10px",color:"#fff",fontWeight:700,fontSize:11,cursor:"pointer"}}>
                  ✅ APPROVE
                </button>
                <button onClick={handleReject}
                  style={{background:"#c0392b",border:"none",borderRadius:6,padding:"4px 10px",color:"#fff",fontWeight:700,fontSize:11,cursor:"pointer"}}>
                  ❌ REJECT
                </button>
              </>
            )}
            <div style={{flex:1}}/>
            {!showDashboard&&currentQuoteId&&(
              <CopyEmailButton qi={qi} ti={ti} emis={emis} pqs={pqs} dcms={dcms} showToast={showToast}/>
            )}
            {!showDashboard&&currentQuoteId&&(
              <button onClick={()=>setShowChatter(c=>!c)}
                style={{background:showChatter?"rgba(26,82,118,0.9)":"rgba(255,255,255,0.12)",
                  border:"1px solid rgba(255,255,255,0.2)",borderRadius:5,padding:"3px 10px",
                  color:"#fff",fontWeight:700,fontSize:11,cursor:"pointer",
                  display:"flex",alignItems:"center",gap:5}}>
                💬 CHATTER{chatterEntries.length>0&&<span style={{background:"rgba(255,255,255,0.25)",borderRadius:10,padding:"1px 6px",fontSize:10}}>{chatterEntries.length}</span>}
              </button>
            )}
            {!showDashboard&&currentQuoteId&&(
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                {quoteSentAt&&(
                  <span style={{background:"rgba(30,132,73,0.85)",borderRadius:5,
                    padding:"3px 8px",color:"#fff",fontSize:10,fontWeight:700,
                    letterSpacing:.3,whiteSpace:"nowrap"}}>
                    ✓ Sent {new Date(quoteSentAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}
                  </span>
                )}
                <button onClick={async()=>{
                    const {error,data}=await supabase.from("follow_ups").insert({
                      quote_id:currentQuoteId,
                      opportunity:qi.opp,
                      customer:qi.account,
                      sent_by:currentUser,
                    }).select("sent_at").single();
                    if(error)showToast("Error marking as sent","error",4000);
                    else{
                      setQuoteSentAt(data.sent_at);
                      showToast("✉️ Marked as sent — will appear in Follow-ups in 30 days","success",4000);
                    }
                  }}
                  style={{background:"rgba(255,255,255,0.12)",border:"1px solid rgba(255,255,255,0.2)",
                    borderRadius:5,padding:"3px 10px",color:"#fff",fontWeight:700,fontSize:11,
                    cursor:"pointer"}}>
                  ✉️ Mark as Sent
                </button>
              </div>
            )}

            {/* ── Flag button ── */}
            {!showDashboard&&currentQuoteId&&(
              <div style={{position:"relative"}}>
                <button onClick={()=>{setShowFlagPopover(v=>!v);}}
                  style={{background:quoteFlag?"rgba(185,28,28,0.85)":"rgba(255,255,255,0.12)",
                    border:"1px solid rgba(255,255,255,0.2)",borderRadius:5,padding:"3px 10px",
                    color:"#fff",fontWeight:700,fontSize:11,cursor:"pointer"}}>
                  🚩 {quoteFlag?"FLAGGED":"Flag"}
                </button>
                {showFlagPopover&&(
                  <div style={{position:"absolute",top:"calc(100% + 8px)",right:0,zIndex:500,
                    background:"#fff",borderRadius:10,boxShadow:"0 4px 20px rgba(0,0,0,0.15)",
                    border:"1px solid #e8ecf0",padding:"14px 16px",minWidth:260}}>
                    <div onClick={()=>setShowFlagPopover(false)} style={{position:"fixed",inset:0,zIndex:-1}}/>
                    <div style={{fontSize:11,fontWeight:700,color:"#9aa5b1",letterSpacing:.8,marginBottom:8}}>
                      {quoteFlag?"REMOVE FLAG":"FLAG THIS QUOTE"}
                    </div>
                    {quoteFlag?(
                      <div>
                        <div style={{fontSize:11,color:"#4a5568",marginBottom:4}}>
                          Flagged by {quoteFlag.flagged_by} on {new Date(quoteFlag.flagged_at).toLocaleDateString()}
                        </div>
                        {quoteFlag.note&&<div style={{fontSize:11,color:"#6b7a8d",fontStyle:"italic",marginBottom:10}}>"{quoteFlag.note}"</div>}
                        <button onClick={handleFlag} disabled={flagLoading}
                          style={{width:"100%",background:"#b91c1c",border:"none",borderRadius:6,
                            padding:"7px 0",color:"#fff",fontWeight:700,fontSize:11,cursor:"pointer"}}>
                          {flagLoading?"Removing…":"✕ Remove Flag"}
                        </button>
                      </div>
                    ):(
                      <div>
                        <textarea
                          value={flagNote}
                          onChange={e=>setFlagNote(e.target.value)}
                          placeholder="Add a note (optional)..."
                          rows={2}
                          style={{width:"100%",fontSize:11,borderRadius:6,border:"1px solid #d0d7de",
                            padding:"6px 8px",resize:"none",fontFamily:"inherit",marginBottom:8,
                            boxSizing:"border-box"}}
                        />
                        <button onClick={handleFlag} disabled={flagLoading}
                          style={{width:"100%",background:"#b91c1c",border:"none",borderRadius:6,
                            padding:"7px 0",color:"#fff",fontWeight:700,fontSize:11,cursor:"pointer"}}>
                          {flagLoading?"Flagging…":"🚩 Flag This Quote"}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {!showDashboard&&currentQuoteId&&(
              <div style={{position:"relative"}}>
                <button onClick={()=>{
                    setShowFollowUpPopover(v=>!v);
                    // Default date = today
                    if(!followUpDate)setFollowUpDate(new Date().toISOString().slice(0,10));
                  }}
                  style={{background:"rgba(255,255,255,0.12)",border:"1px solid rgba(255,255,255,0.2)",
                    borderRadius:5,padding:"3px 10px",color:"#fff",fontWeight:700,fontSize:11,cursor:"pointer"}}>
                  📌 Follow Up
                </button>
                {showFollowUpPopover&&(
                  <div style={{position:"absolute",top:"calc(100% + 8px)",right:0,zIndex:500,
                    background:"#fff",borderRadius:10,boxShadow:"0 4px 20px rgba(0,0,0,0.15)",
                    border:"1px solid #e8ecf0",padding:"14px 16px",minWidth:220}}>
                    {/* Click outside to close */}
                    <div onClick={()=>setShowFollowUpPopover(false)}
                      style={{position:"fixed",inset:0,zIndex:-1}}/>
                    <div style={{fontSize:11,fontWeight:700,color:"#9aa5b1",letterSpacing:.8,marginBottom:10}}>
                      ADD TO FOLLOW-UPS
                    </div>
                    {/* Right now option */}
                    <button onClick={async()=>{
                        const today=new Date().toISOString().slice(0,10);
                        const followupAt=new Date(Date.now()-30*24*60*60*1000).toISOString().slice(0,10);
                        const {error}=await supabase.from("follow_ups").insert({
                          quote_id:currentQuoteId,
                          opportunity:qi.opp,
                          customer:qi.account,
                          sent_by:currentUser,
                          sent_at:new Date(Date.now()-30*24*60*60*1000-1000).toISOString(), // 30 days ago = shows immediately
                          followup_again_at:null,
                        });
                        setShowFollowUpPopover(false);
                        if(error)showToast("Error adding follow-up","error",4000);
                        else showToast("📌 Added to follow-ups now","success",3000);
                      }}
                      style={{width:"100%",background:"#1a5276",border:"none",borderRadius:7,
                        padding:"8px 12px",color:"#fff",fontWeight:700,fontSize:12,
                        cursor:"pointer",marginBottom:8,textAlign:"left"}}>
                      ⚡ Follow up right now
                    </button>
                    {/* Scheduled option */}
                    <div style={{fontSize:11,color:"#6b7a8d",marginBottom:6,fontWeight:600}}>
                      — or schedule for a date —
                    </div>
                    <input type="date" value={followUpDate}
                      onChange={e=>setFollowUpDate(e.target.value)}
                      min={new Date().toISOString().slice(0,10)}
                      style={{width:"100%",border:"1px solid #d0d7de",borderRadius:6,
                        padding:"6px 8px",fontSize:12,fontFamily:"inherit",
                        boxSizing:"border-box",marginBottom:8}}/>
                    <button onClick={async()=>{
                        if(!followUpDate){showToast("Pick a date first","info");return;}
                        // Set sent_at far enough back that it won't show until followup_again_at
                        const {error}=await supabase.from("follow_ups").insert({
                          quote_id:currentQuoteId,
                          opportunity:qi.opp,
                          customer:qi.account,
                          sent_by:currentUser,
                          sent_at:new Date(Date.now()-31*24*60*60*1000).toISOString(), // already 31d old
                          followed_up:true,  // hide from list initially
                          followed_up_at:new Date().toISOString(),
                          followed_up_by:currentUser,
                          followup_again_at:followUpDate, // show on this date
                        });
                        setShowFollowUpPopover(false);
                        if(error)showToast("Error scheduling follow-up","error",4000);
                        else showToast(`📌 Follow-up scheduled for ${new Date(followUpDate+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}`,"success",4000);
                      }}
                      disabled={!followUpDate}
                      style={{width:"100%",background:followUpDate?"#1e8449":"#ccc",border:"none",
                        borderRadius:7,padding:"8px 12px",color:"#fff",fontWeight:700,
                        fontSize:12,cursor:followUpDate?"pointer":"not-allowed",textAlign:"left"}}>
                      📅 Schedule for this date
                    </button>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={()=>{ const pendingLock=approval.status==="pending"; if(!pendingLock||isApprover) setLocked(l=>!l); }}
              title={approval.status==="pending"&&!isApprover?"Only owners can unlock a quote pending approval":""}
              style={{background:locked?"rgba(183,121,31,0.85)":"rgba(45,106,79,0.85)",border:"none",borderRadius:5,padding:"3px 10px",
                color:"#fff",fontWeight:700,fontSize:11,
                cursor:approval.status==="pending"&&!isApprover?"not-allowed":"pointer",
                display:"flex",alignItems:"center",gap:4,
                opacity:approval.status==="pending"&&!isApprover?0.5:1}}>
              {locked?"🔒 LOCKED":"🔓 UNLOCKED"}
            </button>
          </div>
        )}
      </div>

      {/* ── Body: left scroll + right sticky summary ── */}
      <div style={{flex:1,display:"flex",overflow:"hidden"}}>

        {showDashboard?(
          <Dashboard onEnterQuote={()=>{handleNewQuote(true);navigateTo(false);}} onLoadQuote={q=>{handleLoad(q);navigateTo(false);}} onNewQuoteForAccount={name=>{handleNewQuote(true);setQi(q=>({...q,account:name}));navigateTo(false);}} currentUser={currentUser} isApprover={isApprover} isFollowUpUser={isFollowUpUser} pendingQuotes={pendingQuotes} onQueueDecision={handleQueueDecision} needsRefresh={dashboardNeedsRefresh} onRefreshComplete={()=>setDashboardNeedsRefresh(false)}/>
        ):(
        <>{/* ── Left: scrollable form column ── */}
        <div style={{flex:1,overflowY:"auto",background:C.bg,padding:14,position:"relative"}}>



          {/* ── Approval submission modal ── */}
          {showApprovalModal&&(
            <div style={{position:"fixed",inset:0,zIndex:2000,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center"}}
              onClick={e=>{if(e.target===e.currentTarget)setShowApprovalModal(false);}}>
              <div style={{background:"#fff",borderRadius:14,padding:28,width:440,boxShadow:"0 8px 40px rgba(0,0,0,0.25)"}}>
                <div style={{fontWeight:700,fontSize:15,color:"#1a2332",marginBottom:6}}>Submit Quote for Approval</div>
                <div style={{fontSize:12,color:"#6b7a8d",marginBottom:16,lineHeight:1.6}}>
                  This will <b>lock the quote</b> and notify the approvers. They will be able to approve, reject, or make changes before approving.
                </div>
                <div style={{background:"#f0f2f5",borderRadius:8,padding:"10px 14px",marginBottom:16,fontSize:12}}>
                  <div style={{color:"#6b7a8d",marginBottom:4,fontWeight:600}}>QUOTE DETAILS</div>
                  <div><b>Opportunity:</b> {qi.opp||"(none)"}</div>
                  <div><b>RFQ:</b> {qi.rfq||"(none)"}</div>
                  <div><b>Total:</b> {money(displayTotal)}</div>
                  <div style={{marginTop:6,color:"#6b7a8d",fontSize:11}}>Notifying: Jordan McAdoo, Ragen McAdoo, Russ McAdoo</div>
                </div>
                <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
                  <button onClick={()=>setShowApprovalModal(false)}
                    style={{background:"#e8ecf0",border:"none",borderRadius:7,padding:"8px 18px",fontWeight:600,fontSize:12,cursor:"pointer",color:"#1a2332"}}>
                    Cancel
                  </button>
                  <button onClick={handleSubmitApproval}
                    style={{background:"#6d28d9",border:"none",borderRadius:7,padding:"8px 20px",fontWeight:700,fontSize:12,cursor:"pointer",color:"#fff"}}>
                    Submit for Approval
                  </button>
                </div>
              </div>
            </div>
          )}


          {/* ── Approval History Modal ── */}
          {showApprovalHistory&&(
            <div style={{position:"fixed",inset:0,zIndex:2000,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center"}}
              onClick={e=>{if(e.target===e.currentTarget)setShowApprovalHistory(false);}}>
              <div style={{background:"#fff",borderRadius:14,width:480,maxWidth:"95vw",maxHeight:"75vh",
                boxShadow:"0 8px 40px rgba(0,0,0,0.3)",display:"flex",flexDirection:"column"}}>

                {/* Header */}
                <div style={{padding:"18px 24px",borderBottom:"1px solid #e8ecf0",display:"flex",alignItems:"center",gap:10}}>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,fontSize:15,color:"#1a2332"}}>📋 Approval History</div>
                    <div style={{fontSize:11,color:"#6b7a8d",marginTop:2}}>
                      {qi.opp||"(no opportunity #)"}
                    </div>
                  </div>
                  <button onClick={()=>setShowApprovalHistory(false)}
                    style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#6b7a8d",lineHeight:1}}>×</button>
                </div>

                {/* Timeline */}
                <div style={{flex:1,overflowY:"auto",padding:"20px 24px"}}>
                  {(approval.history||[]).length===0?(
                    <div style={{textAlign:"center",color:"#6b7a8d",fontSize:13,padding:20}}>No history recorded.</div>
                  ):(
                    <div style={{position:"relative"}}>
                      {/* Vertical line */}
                      <div style={{position:"absolute",left:14,top:8,bottom:8,width:2,background:"#e8ecf0"}}/>
                      {(approval.history||[]).map((evt,i)=>{
                        const isLast=i===(approval.history.length-1);
                        const color=evt.event==="approved"?"#1e8449":evt.event==="rejected"?"#c0392b":"#6d28d9";
                        const icon=evt.event==="approved"?"✅":evt.event==="rejected"?"❌":"📤";
                        const label=evt.event==="approved"?"Approved":evt.event==="rejected"?"Rejected":"Submitted for Approval";
                        const dt=evt.at?new Date(evt.at):null;
                        const dateStr=dt?dt.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"";
                        const timeStr=dt?dt.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}):"";
                        return(
                          <div key={i} style={{display:"flex",gap:16,marginBottom:i<(approval.history.length-1)?20:0,position:"relative"}}>
                            {/* Dot */}
                            <div style={{width:30,height:30,borderRadius:"50%",background:color,
                              display:"flex",alignItems:"center",justifyContent:"center",
                              fontSize:14,flexShrink:0,zIndex:1,boxShadow:"0 0 0 3px #fff"}}>
                              {icon}
                            </div>
                            {/* Content */}
                            <div style={{flex:1,paddingTop:4}}>
                              <div style={{fontWeight:700,fontSize:13,color:color,marginBottom:2}}>{label}</div>
                              <div style={{fontSize:12,color:"#1a2332",marginBottom:2}}>
                                <b>{evt.by||"Unknown"}</b>
                              </div>
                              <div style={{fontSize:11,color:"#6b7a8d"}}>
                                {dateStr}{timeStr?` at ${timeStr}`:""}
                              </div>
                              {evt.comments&&(
                                <div style={{marginTop:6,background:"#f8f9fb",borderRadius:6,padding:"6px 10px",
                                  fontSize:11,color:"#1a2332",borderLeft:"3px solid "+color}}>
                                  {evt.comments}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div style={{padding:"12px 24px",borderTop:"1px solid #e8ecf0",textAlign:"right"}}>
                  <button onClick={()=>setShowApprovalHistory(false)}
                    style={{background:"#e8ecf0",border:"none",borderRadius:7,padding:"7px 20px",
                      fontWeight:600,fontSize:12,cursor:"pointer",color:"#1a2332"}}>
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
          {/* ── Fab Guide Modal ── */}
          {showFabGuide&&(
            <div style={{position:"fixed",inset:0,zIndex:2000,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center"}}
              onClick={e=>{if(e.target===e.currentTarget)setShowFabGuide(false);}}>
              <div style={{background:"#fff",borderRadius:14,width:640,maxWidth:"96vw",maxHeight:"88vh",
                boxShadow:"0 8px 40px rgba(0,0,0,0.3)",display:"flex",flexDirection:"column"}}>
                <div style={{padding:"16px 22px",borderBottom:"1px solid #e8ecf0",display:"flex",alignItems:"center"}}>
                  <div style={{flex:1,fontWeight:700,fontSize:15,color:"#1a2332"}}>Estimated fab times per test</div>
                  <button onClick={()=>setShowFabGuide(false)}
                    style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#6b7a8d",lineHeight:1}}>×</button>
                </div>
                <div style={{flex:1,overflowY:"auto",padding:"12px 16px"}}>
                  {[
                    {hdr:"Medium weight shock",rows:[
                      ["Standard","4 holes","Up to 8 hrs"],
                      ["Standard","8 holes","Up to 12 hrs"],
                      ["Standard","16 holes","16 hrs"],
                      ["Standard",">16 holes",">16 hrs"],
                      ["Bookend (in stock)","Up to 12\" valves","8 – 12 hrs"],
                      ["Bookend (in stock)",">12\" valves",">12 hrs"],
                    ]},
                    {hdr:"Lightweight shock",rows:[
                      ["Standard","4 holes","4 hrs"],
                      ["Standard","6 – 8 holes","6 hrs"],
                      ["Standard","8+ holes","8 hrs"],
                      ["Bookend (in stock)","Any","8 hrs or less"],
                    ]},
                    {hdr:"Vibration — with MWS (use MWS rules)",rows:[
                      ["Standard","4 holes","Up to 8 hrs"],
                      ["Standard","8 holes","Up to 12 hrs"],
                      ["Standard","16 holes","16 hrs"],
                      ["Standard",">16 holes",">16 hrs"],
                      ["Bookend (in stock)","Up to 12\" valves","8 – 12 hrs"],
                      ["Bookend (in stock)",">12\" valves",">12 hrs"],
                    ]},
                    {hdr:"Vibration — with LWS or standalone <250 lbs (use LWS rules)",rows:[
                      ["Standard","4 holes","4 hrs"],
                      ["Standard","6 – 8 holes","6 hrs"],
                      ["Standard","8+ holes","8 hrs"],
                      ["Bookend (in stock)","Any","8 hrs or less"],
                    ]},
                    {hdr:"Vibration — standalone >250 lbs (use MWS rules)",rows:[
                      ["Standard","4 holes","Up to 8 hrs"],
                      ["Standard","8 holes","Up to 12 hrs"],
                      ["Standard","16 holes","16 hrs"],
                      ["Standard",">16 holes",">16 hrs"],
                    ]},
                    {hdr:"AB / SB noise — <250 lbs (use LWS rules)",rows:[
                      ["Standard","4 holes","4 hrs"],
                      ["Standard","6 – 8 holes","6 hrs"],
                      ["Standard","8+ holes","8 hrs"],
                    ]},
                    {hdr:"AB / SB noise — >250 lbs (use MWS rules)",rows:[
                      ["Standard","4 holes","Up to 8 hrs"],
                      ["Standard","8 holes","Up to 12 hrs"],
                      ["Standard","16 holes","16 hrs"],
                      ["Standard",">16 holes",">16 hrs"],
                    ]},
                    {hdr:"HFV / shock (other)",rows:[
                      ["Standard","4 holes","4 hrs"],
                      ["Standard","6 – 8 holes","6 hrs"],
                      ["Standard","8+ holes","8 hrs"],
                    ]},
                  ].map((section,si)=>(
                    <div key={si} style={{marginBottom:12}}>
                      <div style={{background:"#e8f0fb",padding:"4px 10px",fontSize:11,fontWeight:700,
                        color:"#1a5276",borderRadius:4,marginBottom:0}}>
                        {section.hdr}
                      </div>
                      <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                        <tbody>
                          {section.rows.map((row,ri)=>(
                            <tr key={ri} style={{background:ri%2===0?"#fff":"#f8f9fb"}}>
                              <td style={{padding:"4px 10px",borderBottom:"1px solid #f0f2f5",color:"#6b7a8d",width:"30%"}}>{row[0]}</td>
                              <td style={{padding:"4px 10px",borderBottom:"1px solid #f0f2f5",width:"35%"}}>{row[1]}</td>
                              <td style={{padding:"4px 10px",borderBottom:"1px solid #f0f2f5",fontWeight:600,width:"35%"}}>{row[2]}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                  <div style={{fontSize:10,color:"#6b7a8d",padding:"6px 4px"}}>
                    All estimates assume standard materials and normal geometry. Review with engineering for unusual cases.
                  </div>
                </div>
                <div style={{padding:"10px 22px",borderTop:"1px solid #e8ecf0",textAlign:"right"}}>
                  <button onClick={()=>setShowFabGuide(false)}
                    style={{background:"#e8ecf0",border:"none",borderRadius:7,padding:"7px 20px",
                      fontWeight:600,fontSize:12,cursor:"pointer",color:"#1a2332"}}>
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
          {/* ── Clone modal — enter new opportunity # ── */}
          {showCloneModal&&(
            <div style={{position:"fixed",inset:0,zIndex:2000,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center"}}
              onClick={e=>{if(e.target===e.currentTarget){setShowCloneModal(false);setCloneOppInput("");}}}>
              <div style={{background:"#fff",borderRadius:14,padding:28,width:380,boxShadow:"0 8px 40px rgba(0,0,0,0.25)"}}>
                <div style={{fontWeight:700,fontSize:15,color:"#1a2332",marginBottom:6}}>Clone Quote</div>
                <div style={{fontSize:12,color:"#6b7a8d",marginBottom:16,lineHeight:1.6}}>
                  All test details will be copied. Enter the new opportunity number to continue.
                </div>
                <div style={{marginBottom:16}}>
                  <div style={{fontSize:9,color:"#6b7a8d",fontWeight:700,marginBottom:4}}>NEW OPPORTUNITY #</div>
                  <input
                    autoFocus
                    value={cloneOppInput}
                    onChange={e=>setCloneOppInput(e.target.value)}
                    onKeyDown={e=>{if(e.key==="Enter")doClone(cloneOppInput);}}
                    placeholder="e.g. 2025-0042"
                    style={{width:"100%",fontSize:13,borderRadius:7,border:"1px solid #d0d7de",padding:"8px 10px",outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
                </div>
                <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
                  <button onClick={()=>{setShowCloneModal(false);setCloneOppInput("");}}
                    style={{background:"#e8ecf0",border:"none",borderRadius:7,padding:"8px 18px",fontWeight:600,fontSize:12,cursor:"pointer",color:"#1a2332"}}>
                    Cancel
                  </button>
                  <button onClick={()=>doClone(cloneOppInput)}
                    style={{background:"#2e6da4",border:"none",borderRadius:7,padding:"8px 20px",fontWeight:700,fontSize:12,cursor:"pointer",color:"#fff"}}>
                    Clone
                  </button>
                </div>
              </div>
            </div>
          )}
          {/* ── Won Details modal ── */}
          {showWonModal&&(
            <div style={{position:"fixed",inset:0,zIndex:2000,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center"}}
              onClick={e=>{if(e.target===e.currentTarget)setShowWonModal(false);}}>
              <div style={{background:"#fff",borderRadius:14,padding:28,width:380,boxShadow:"0 8px 40px rgba(0,0,0,0.25)"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <span style={{fontSize:18}}>🏆</span>
                    <div style={{fontWeight:700,fontSize:15,color:"#145a32"}}>Closed Won Details</div>
                  </div>
                  <button onClick={()=>setWonLocked(l=>!l)}
                    title={wonLocked?"Unlock to edit":"Lock to prevent changes"}
                    style={{background:wonLocked?"#b7791f":"#2d6a4f",border:"none",borderRadius:6,
                      padding:"4px 10px",color:"#fff",fontWeight:700,fontSize:11,cursor:"pointer",display:"flex",alignItems:"center",gap:5}}>
                    {wonLocked?"🔒 Locked":"🔓 Unlocked"}
                  </button>
                </div>
                <div style={{fontSize:11,color:"#6b7a8d",marginBottom:18,lineHeight:1.5}}>
                  Internal use only — this information is not included in the quote PDF.
                </div>
                {wonLocked&&(
                  <div style={{background:"rgba(183,121,31,0.1)",border:"1px solid #b7791f",borderRadius:7,
                    padding:"7px 12px",marginBottom:14,fontSize:11,color:"#7b4f12",fontWeight:600}}>
                    🔒 Fields are locked — click Unlocked to make changes
                  </div>
                )}
                {[
                  ["Won Date","wonDate","e.g. 3/18/2026"],
                  ["Job #","jobNum","e.g. J-2025-042"],
                  ["PO #","poNum","e.g. PO-98765"],
                ].map(([label,key,placeholder])=>(
                  <div key={key} style={{marginBottom:14}}>
                    <div style={{fontSize:9,color:"#6b7a8d",fontWeight:700,marginBottom:4}}>{label}</div>
                    <input
                      value={wonInfo[key]||""}
                      onChange={e=>!wonLocked&&setWonInfo({...wonInfo,[key]:e.target.value})}
                      readOnly={wonLocked}
                      placeholder={placeholder}
                      style={{width:"100%",fontSize:12,borderRadius:7,border:"1px solid #d0d7de",padding:"7px 10px",
                        outline:"none",fontFamily:"inherit",boxSizing:"border-box",
                        background:wonLocked?"#f0f2f5":"#fff",color:wonLocked?"#6b7a8d":"#1a2332",
                        cursor:wonLocked?"not-allowed":"text"}}/>
                  </div>
                ))}
                <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:6}}>
                  <button onClick={()=>setShowCreateProjectAlert("new")}
                    style={{background:"#1a5276",border:"none",borderRadius:7,padding:"8px 14px",fontWeight:700,fontSize:12,cursor:"pointer",color:"#fff",display:"flex",alignItems:"center",gap:5,flex:1}}>
                    🏗️ Create Project
                  </button>
                  <button onClick={()=>setShowCreateProjectAlert("existing")}
                    style={{background:"#6c3483",border:"none",borderRadius:7,padding:"8px 14px",fontWeight:700,fontSize:12,cursor:"pointer",color:"#fff",display:"flex",alignItems:"center",gap:5,flex:1}}>
                    ➕ Add to Existing
                  </button>
                  <button onClick={()=>{
                      setWonLocked(true);
                      setShowWonModal(false);
                      if(!wonApproval||wonApproval.status==="none"||!wonApproval.status){
                        handleSubmitWonApproval(qi.stage);
                      } else {
                        handleSave();
                      }
                    }}
                    style={{background:"#1e8449",border:"none",borderRadius:7,padding:"8px 14px",fontWeight:700,fontSize:12,cursor:"pointer",color:"#fff",flex:1}}>
                    Save &amp; Close
                  </button>
                </div>
                {showCreateProjectAlert&&(
                  <div style={{marginTop:10,background:showCreateProjectAlert==="new"?"#f0f9ff":"#faf5ff",
                    border:"1px solid "+(showCreateProjectAlert==="new"?"#0ea5e9":"#7c3aed"),
                    borderRadius:7,padding:"10px 14px",fontSize:12,
                    color:showCreateProjectAlert==="new"?"#0c4a6e":"#4c1d95",
                    display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
                    <span>🚧 {showCreateProjectAlert==="new"?"Create New Project":"Add to Existing Project"} — feature coming soon</span>
                    <button onClick={()=>setShowCreateProjectAlert(false)}
                      style={{background:"none",border:"none",cursor:"pointer",fontSize:14,fontWeight:700}}>×</button>
                  </div>
                )}
              </div>
            </div>
          )}
          {isApprover&&approval.status==="pending"&&(
            <div style={{position:"sticky",top:0,zIndex:100,background:"rgba(109,40,217,0.08)",
              border:"1px solid #6d28d9",borderRadius:8,padding:"10px 14px",marginBottom:10}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                <span style={{fontSize:15}}>📋</span>
                <span style={{fontSize:12,color:"#4c1d95",fontWeight:700}}>
                  Pending Quote Approval — submitted by {approval.submittedBy} on {approval.submittedAt?new Date(approval.submittedAt).toLocaleDateString():""} 
                </span>
              </div>
              <div style={{fontSize:11,color:"#6b7a8d",marginBottom:6}}>
                Add comments (optional) before approving or rejecting:
              </div>
              <textarea value={approvalComments} onChange={e=>setApprovalComments(e.target.value)}
                placeholder="Comments for the submitter..."
                rows={2}
                style={{width:"100%",fontSize:11,borderRadius:6,border:"1px solid #d0d7de",padding:"6px 8px",resize:"vertical",fontFamily:"inherit",boxSizing:"border-box",marginBottom:8}}/>
            </div>
          )}
          {isApprover&&wonApproval.status==="pending_won"&&(
            <div style={{position:"sticky",top:0,zIndex:100,background:"rgba(30,132,73,0.08)",
              border:"1px solid #1e8449",borderRadius:8,padding:"10px 14px",marginBottom:10}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                <span style={{fontSize:15}}>🏆</span>
                <span style={{fontSize:12,color:"#145a32",fontWeight:700}}>
                  Pending Closed Won Approval — submitted by {wonApproval.submittedBy} on {wonApproval.submittedAt?new Date(wonApproval.submittedAt).toLocaleDateString():""}
                </span>
              </div>
              <div style={{fontSize:11,color:"#6b7a8d",marginBottom:6}}>
                Add comments (optional) before approving or rejecting:
              </div>
              <textarea value={approvalComments} onChange={e=>setApprovalComments(e.target.value)}
                placeholder="Comments for the submitter..."
                rows={2}
                style={{width:"100%",fontSize:11,borderRadius:6,border:"1px solid #d0d7de",padding:"6px 8px",resize:"vertical",fontFamily:"inherit",boxSizing:"border-box",marginBottom:8}}/>
              <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                <button onClick={()=>handleWonReject(approvalComments)}
                  style={{background:"#c0392b",border:"none",borderRadius:6,padding:"5px 14px",fontWeight:700,fontSize:11,cursor:"pointer",color:"#fff"}}>
                  ❌ REJECT WON
                </button>
                <button onClick={()=>handleWonApprove(approvalComments)}
                  style={{background:"#1e8449",border:"none",borderRadius:6,padding:"5px 14px",fontWeight:700,fontSize:11,cursor:"pointer",color:"#fff"}}>
                  ✅ APPROVE WON
                </button>
              </div>
            </div>
          )}
          {/* ── Approval result banner ── */}
          {approval.status==="approved"&&(
            <div style={{position:"sticky",top:0,zIndex:100,background:"rgba(30,132,73,0.1)",
              border:"1px solid #1e8449",borderRadius:8,padding:"8px 14px",marginBottom:10,
              display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:16}}>✅</span>
              <span style={{fontSize:12,color:"#145a32",fontWeight:600}}>
                Approved by {approval.decidedBy} on {approval.decidedAt?new Date(approval.decidedAt).toLocaleDateString():""}
                {approval.comments&&" — "+approval.comments}
              </span>
            </div>
          )}
          {approval.status==="rejected"&&(
            <div style={{position:"sticky",top:0,zIndex:100,background:"rgba(192,57,43,0.08)",
              border:"1px solid #c0392b",borderRadius:8,padding:"8px 14px",marginBottom:10,
              display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:16}}>❌</span>
              <span style={{fontSize:12,color:"#922b21",fontWeight:600}}>
                Rejected by {approval.decidedBy} on {approval.decidedAt?new Date(approval.decidedAt).toLocaleDateString():""}
                {approval.comments&&" — "+approval.comments}
              </span>
            </div>
          )}
          {locked&&approval.status==="none"&&!isSalesforce&&(
            <div style={{position:"sticky",top:0,zIndex:100,background:"rgba(183,121,31,0.12)",
              border:"1px solid #b7791f",borderRadius:8,padding:"8px 14px",marginBottom:10,
              display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:16}}>🔒</span>
              <span style={{fontSize:12,color:"#7b4f12",fontWeight:600}}>
                Form is locked — click UNLOCKED in the header to edit
              </span>
            </div>
          )}
          {isSalesforce&&(
            <div style={{position:"sticky",top:0,zIndex:100,background:"rgba(26,82,118,0.08)",
              border:"1px solid #1a5276",borderRadius:8,padding:"8px 14px",marginBottom:10,
              display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:16}}>📥</span>
                <span style={{fontSize:12,color:"#1a5276",fontWeight:600}}>
                  Imported from Salesforce — locked by default. Click UNLOCKED in the header to edit.
                </span>
              </div>
            </div>
          )}

          {/* ── Edit toggle — outside locked wrapper so always clickable ── */}
          {currentQuoteId&&!locked&&(
            <div style={{display:"flex",justifyContent:"flex-start",marginBottom:8}}>
              {isDirty
                ? <button onClick={()=>setIsDirty(false)} title="Lock quote"
                    style={{fontSize:13,background:"#b7791f",color:"#fff",border:"none",
                      borderRadius:7,padding:"7px 18px",fontWeight:700,cursor:"pointer",
                      display:"flex",alignItems:"center",gap:6,letterSpacing:.3}}>
                    ✏️ EDITING — click to lock
                  </button>
                : <button onClick={()=>setIsDirty(true)} title="Edit this quote"
                    style={{fontSize:13,background:"#276749",color:"#fff",border:"none",
                      borderRadius:7,padding:"7px 18px",fontWeight:700,cursor:"pointer",
                      display:"flex",alignItems:"center",gap:6,letterSpacing:.3}}>
                    🔒 EDIT
                  </button>
              }
            </div>
          )}

          <div style={{
            pointerEvents:(locked||(currentQuoteId&&!isDirty))?"none":"auto",
            opacity:(locked||(currentQuoteId&&!isDirty))?0.65:1,
            transition:"opacity 0.2s"}}>

            {/* ── Row 1: Quote Info | Test Item Description ── */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>

              {/* Quote Info */}
              <div style={{...card}}>
                <div style={{fontSize:9,color:C.accent,fontWeight:700,letterSpacing:2,marginBottom:8}}>QUOTE INFORMATION</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 16px"}}>
                  <div>
                    <ClientContactPicker qi={qi} setQi={setQi} resetKey={currentQuoteId}/>
                    {/* RFQ / PO */}
                    <div style={{marginBottom:6}}>
                      <div style={{fontSize:9,color:C.dim,marginBottom:2}}>RFQ / PO</div>
                      <input value={qi.rfq||""} onChange={e=>setQi({...qi,rfq:e.target.value})} style={{...inp,width:"100%"}}/>
                    </div>
                    <div style={{marginBottom:6}}>
                      <div style={{fontSize:9,color:C.dim,marginBottom:2}}>Bill To</div>
                      <input value={qi.billTo||""} onChange={e=>setQi({...qi,billTo:e.target.value})}
                        placeholder="Street address" style={{...inp,width:"100%",marginBottom:3,color:qi.billTo?C.text:C.muted}}/>
                      <input value={qi.billToCity||""} onChange={e=>setQi({...qi,billToCity:e.target.value})}
                        placeholder="City, State, Zip" style={{...inp,width:"100%",color:qi.billToCity?C.text:C.muted}}/>
                    </div>
                    <div style={{marginBottom:6}}>
                      <div style={{fontSize:9,color:C.dim,marginBottom:2}}>Type</div>
                      <select value={qi.type||"New Business"} onChange={e=>setQi({...qi,type:e.target.value})} style={{...sel,width:"100%"}}>
                        {["New Business","Existing Business"].map(o=><option key={o}>{o}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    {[["Opportunity #","opp"],["Prepared By","prepby"],["Quote Revision","rev"],["Related Opps","relatedOpps"]].map(([l,k])=>(
                      <div key={k} style={{marginBottom:6}}>
                        <div style={{fontSize:9,color:C.dim,marginBottom:2}}>{l}</div>
                        <input value={qi[k]||""} onChange={e=>setQi({...qi,[k]:e.target.value})} style={{...inp,width:"100%"}}/>
                      </div>
                    ))}
                    <div style={{marginBottom:6,pointerEvents:"auto",opacity:1}}>
                      <div style={{fontSize:9,color:C.dim,marginBottom:2}}>Stage</div>
                      <select value={qi.stage} onChange={e=>{
                        const s=e.target.value;
                        setQi({...qi,stage:s});
                        if(s==="Closed Won"&&!wonInfo.wonDate)
                          setWonInfo(w=>({...w,wonDate:new Date().toLocaleDateString("en-US")}));
                        // Prompt to submit for won approval when changing to Closed Won
                        if(s==="Closed Won"&&wonApproval.status==="none"){
                          setTimeout(()=>{
                            const submit=window.confirm("Submit this quote for Closed Won approval?\n\nClick OK to submit, or Cancel to set the stage without submitting.");
                            if(submit)handleSubmitWonApproval(s);
                            else{
                              const q={id:currentQuoteId||undefined,opp:qi.opp,customer:qi.account,rfq:qi.rfq,total:displayTotal,
                                qi:{...qi,stage:s},ti,vibs,shocks,noises,envs,hfvs,shos,dcms,pqs,emis,abs,sbs,inst,ot,custom,budget,coc,sub,td,setup,globalPR,notes,splitProcReport,modalAnalysis,fixtureDrawing,inStockModal,wonInfo,approval,wonApproval,chatterEntries,summary,lineOrder,lineOverrides,pickerLines,unifiedOrder};
                              saveQuoteToSupabase(q,autoSpecs,autoNotes).then(newId=>{
                                if(newId){setCurrentQuoteId(newId);showToast("Saved — "+(qi.opp||"Untitled"),"success");}
                                else showToast("Save failed — check your connection","error",5000);
                              });
                            }
                          },50);
                        }
                      }} style={{...sel,width:"100%"}}>
                        {["Proposal/Price Quote","Budgetary","Closed Won","Closed Lost","Other"].map(o=><option key={o}>{o}</option>)}
                      </select>
                      {qi.stage==="Closed Won"&&(
                        <button onClick={()=>setShowWonModal(true)}
                          style={{marginTop:5,width:"100%",background:"#1e8449",border:"none",borderRadius:6,
                            padding:"5px 0",color:"#fff",fontWeight:700,fontSize:11,cursor:"pointer",letterSpacing:.3}}>
                          🏆 Won Details
                        </button>
                      )}
                    </div>
                    <div style={{marginBottom:6}}>
                      <div style={{fontSize:9,color:C.dim,marginBottom:2}}>Modified Date</div>
                      <input value={qi.date||""} onChange={e=>setQi({...qi,date:e.target.value})} style={{...inp,width:"100%"}}/>
                    </div>
                  </div>
                </div>
              </div>

              {/* Test Item Description */}
              <div style={{...card}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                  <div style={{fontSize:9,color:C.accent,fontWeight:700,letterSpacing:2}}>TEST ITEM DESCRIPTION</div>
                  {qi.stage==="Closed Won"&&(
                    <button onClick={()=>setShowWonModal(true)}
                      style={{background:"#1e8449",border:"none",borderRadius:6,padding:"3px 10px",
                        color:"#fff",fontWeight:700,fontSize:10,cursor:"pointer",letterSpacing:.3,display:"flex",alignItems:"center",gap:4,
                        pointerEvents:"auto",opacity:1}}>
                      🏆 {wonInfo.jobNum?("Job #"+wonInfo.jobNum):"Won Details"}
                    </button>
                  )}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:6}}>
                  {[["Item","item"],["Qty","qty"],["Model No.","model"],["Drawing No.","drawing"]].map(([l,k])=>(
                    <div key={k}>
                      <div style={{fontSize:9,color:C.dim,marginBottom:2}}>{l}</div>
                      <input value={ti[k]||""} onChange={e=>setTi({...ti,[k]:e.target.value})} style={{...inp,width:"100%"}}/>
                    </div>
                  ))}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:6}}>
                  <div>
                    <div style={{fontSize:9,color:C.dim,marginBottom:2}}>L x W x H (in)</div>
                    <div style={{display:"flex",gap:3}}>
                      {[["dimL","L"],["dimW","W"],["dimH","H"]].map(([k,lbl])=>(
                        <input key={k} value={ti[k]||""} onChange={e=>setTi({...ti,[k]:e.target.value})}
                          placeholder={lbl} style={{...inp,width:"100%"}}/>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={{fontSize:9,color:C.dim,marginBottom:2}}>Weight (lbs)</div>
                    <input value={ti.wt||""} onChange={e=>setTi({...ti,wt:e.target.value})} style={{...inp,width:"100%"}}/>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:6}}>
                  <div>
                    <div style={{fontSize:9,color:C.dim,marginBottom:2}}>Voltage</div>
                    <div style={{display:"flex",gap:4,alignItems:"center"}}>
                      <input value={ti.volt||""} onChange={e=>setTi({...ti,volt:e.target.value})} style={{...inp,width:"100%"}}/>
                      {["AC","DC"].map(t=>(
                        <label key={t} style={{display:"flex",alignItems:"center",gap:3,cursor:"pointer",flexShrink:0}}>
                          <input type="checkbox" checked={(ti.pwrType||"AC")===t}
                            onChange={()=>setTi({...ti,pwrType:t})}
                            style={{accentColor:C.red,width:11,height:11}}/>
                          <span style={{fontSize:10,color:(ti.pwrType||"AC")===t?C.red:C.muted,fontWeight:(ti.pwrType||"AC")===t?700:400}}>{t}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  {[["Phase","phase"],["Hz","hz"],["Inrush (A)","inrush"],["Op. Amps","amps"]].map(([l,k])=>(
                    <div key={k}>
                      <div style={{fontSize:9,color:C.dim,marginBottom:2}}>{l}</div>
                      <input value={ti[k]||""} onChange={e=>setTi({...ti,[k]:e.target.value})} style={{...inp,width:"100%"}}/>
                    </div>
                  ))}
                </div>
                <div style={{marginBottom:6}}>
                  <div style={{fontSize:9,color:C.dim,marginBottom:2}}>Loads</div>
                  <input
                    value={ti.loads!=null?ti.loads:(qi.account?"All electrical and/or resistive loads will be provided by "+qi.account+" unless otherwise discussed.":"")}
                    onChange={e=>setTi({...ti,loads:e.target.value})}
                    placeholder={qi.account?"Auto: uses Account name — clear to override":"Enter load details"}
                    style={{...inp,width:"100%"}}/>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:6}}>
                  <div>
                    <div style={{fontSize:9,color:C.dim,marginBottom:2}}>Mounting</div>
                    <input value={ti.mounting||""} onChange={e=>setTi({...ti,mounting:e.target.value})} style={{...inp,width:"100%"}}/>
                  </div>
                  <div>
                    <div style={{fontSize:9,color:C.dim,marginBottom:2}}>Pressure/Flow</div>
                    <input value={ti.pressureFlow||""} onChange={e=>setTi({...ti,pressureFlow:e.target.value})} style={{...inp,width:"100%"}}/>
                  </div>
                </div>
                <div style={{background:C.panel,borderRadius:7,padding:"6px 10px",marginBottom:8}}>
                  <div style={{fontSize:9,color:C.accent,fontWeight:700,letterSpacing:1,marginBottom:6}}>REGULATORY</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:6}}>
                    {[["GSI","gsi",["Unknown","Yes","No"]],["Cust. Witness","witness",["Unknown","Yes","No"]],["Doc Restriction","docRestriction",["None","ITAR","CUI/Other","NOFORN","Dist Statement B/C/D/E"]]].map(([l,k,opts])=>(
                      <div key={k}>
                        <div style={{fontSize:9,color:C.dim,marginBottom:2}}>{l}</div>
                        <select value={ti[k]||opts[0]} onChange={e=>setTi({...ti,[k]:e.target.value})} style={{...sel,width:"100%"}}>
                          {opts.map(o=><option key={o}>{o}</option>)}
                        </select>
                      </div>
                    ))}
                    <div>
                      <div style={{fontSize:9,color:C.dim,marginBottom:2}}>DPAS Rating</div>
                      <input value={ti.dpas||""} onChange={e=>setTi({...ti,dpas:e.target.value})} style={{...inp,width:"100%"}}/>
                    </div>
                  </div>
                </div>
              </div>
            </div>{/* end Row 1 */}

            {/* ── Row 2: Setup Details | Budget + Subcontracting ── */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>

              {/* Setup Details */}
              <div style={{...card}}>
                <div style={{fontSize:9,color:C.accent,fontWeight:700,letterSpacing:2,marginBottom:8}}>SETUP DETAILS</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:8}}>
                  <div>
                    <div style={{fontSize:9,color:C.dim,marginBottom:2}}>Tech Rate ($/hr)</div>
                    <Inp value={setup.techRate} onChange={v=>setSetup({...setup,techRate:v})} width={70} right/>
                  </div>
                  <div>
                    <div style={{fontSize:9,color:C.dim,marginBottom:2,display:"flex",alignItems:"center",gap:5}}>
                      Fab &amp; Mod Hours
                      <button onClick={()=>setShowFabGuide(true)}
                        title="Estimated fab times per test"
                        style={{background:"none",border:"1px solid "+C.border,borderRadius:"50%",width:14,height:14,
                          padding:0,cursor:"pointer",fontSize:8,color:C.muted,lineHeight:"12px",display:"flex",
                          alignItems:"center",justifyContent:"center",flexShrink:0}}>
                        ?
                      </button>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <Inp value={setup.fabHours} onChange={v=>setSetup({...setup,fabHours:v})} width={60} right/>
                      <span style={{fontSize:10,color:C.muted}}>{"= $"+Math.round(sf(setup.fabHours,4)*sf(setup.techRate,175)).toLocaleString()}</span>
                    </div>
                  </div>
                  <div>
                    <div style={{fontSize:9,color:C.dim,marginBottom:2}}># Holes (drilling)</div>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <Inp value={setup.holes} onChange={v=>setSetup({...setup,holes:v})} width={60} right/>
                      <span style={{fontSize:10,color:C.muted}}>{"= $"+Math.round(sf(setup.holes,0)*0.5*sf(setup.techRate,175)*(setup.drillTap?1.5:1)).toLocaleString()}</span>
                    </div>
                  </div>
                  <div>
                    <div style={{fontSize:9,color:C.dim,marginBottom:2}}># Cables (EMI)</div>
                    <Inp value={setup.cables} onChange={v=>setSetup({...setup,cables:v})} width={60} right/>
                  </div>
                </div>
                <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",marginBottom:8}}>
                  <input type="checkbox" checked={setup.drillTap}
                    onChange={e=>setSetup({...setup,drillTap:e.target.checked})}
                    style={{accentColor:C.red,width:14,height:14}}/>
                  <span style={{fontSize:11,color:setup.drillTap?C.red:C.muted,fontWeight:setup.drillTap?600:400}}>
                    Drill &amp; Tap (x1.5 on drilling cost)
                  </span>
                </label>
                {(sf(setup.holes,0)>0||sf(setup.fabHours,0)>4)&&(
                  <div style={{fontSize:10,color:C.muted,padding:"5px 8px",background:C.panel,borderRadius:5,lineHeight:1.7}}>
                    {sf(setup.holes,0)>0&&<div>{"Drilling: "}{setup.holes}{" hole(s) x 30 min @ $"}{sf(setup.techRate,175).toLocaleString()}{"/hr"}{setup.drillTap?" x 1.5 (D&T)":""}{" = "}<b>{"$"}{Math.round(sf(setup.holes,0)*0.5*sf(setup.techRate,175)*(setup.drillTap?1.5:1)).toLocaleString()}</b></div>}
                    {sf(setup.fabHours,0)>0&&<div>{"Fab & Mod: "}{setup.fabHours}{" hr(s) x $"}{sf(setup.techRate,175).toLocaleString()}{"/hr = "}<b>{"$"}{Math.round(sf(setup.fabHours,0)*sf(setup.techRate,175)).toLocaleString()}</b></div>}
                  </div>
                )}
                {anyOn&&<div style={{marginTop:8}}><PRow label="Tear Down Override (0=auto)" val={td} onChange={setTd}/></div>}
              </div>

              {/* Budget + Subcontracting stacked */}
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <BudgetSection budget={budget} setBudget={setBudget}/>
                <div style={{...card}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:sub.on?8:0}}>
                    <div style={{fontSize:9,color:C.accent,fontWeight:700,letterSpacing:2}}>SUBCONTRACTING</div>
                    <Toggle small checked={sub.on||false} onChange={v=>setSub({...sub,on:v})} label=""/>
                  </div>
                  {sub.on&&(
                    <div>
                      {sub.rows.map((r,i)=>(
                        <div key={i} style={{background:C.panel,borderRadius:7,padding:"7px 10px",marginBottom:5}}>
                          <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:4}}>
                            <span style={{fontSize:9,color:"#2563eb",background:"#dbeafe",borderRadius:4,padding:"2px 5px",fontWeight:700,flexShrink:0}}>98</span>
                            <Inp value={r.desc} onChange={v=>setSub({...sub,rows:sub.rows.map((x,j)=>j===i?{...x,desc:v}:x)})} width={160}/>
                            <span style={{fontSize:11,color:C.muted}}>$</span>
                            <Inp value={r.price} onChange={v=>setSub({...sub,rows:sub.rows.map((x,j)=>j===i?{...x,price:v}:x)})} width={80} right/>
                            <button onClick={()=>setSub({...sub,rows:sub.rows.filter((_,j)=>j!==i)})}
                              style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:14}}>✕</button>
                          </div>
                          <div style={{display:"flex",gap:6,alignItems:"center"}}>
                            <span style={{fontSize:9,color:C.dim,flexShrink:0}}>Identifier:</span>
                            <Inp value={r.identifier||""} onChange={v=>setSub({...sub,rows:sub.rows.map((x,j)=>j===i?{...x,identifier:v}:x)})}
                              width={240} placeholder="Vendor / part / description"/>
                          </div>
                        </div>
                      ))}
                      <button onClick={()=>setSub({...sub,rows:[...sub.rows,{desc:"Subcontract Item",price:"0",identifier:""}]})}
                        style={{background:"none",border:"1px dashed "+C.border,borderRadius:7,color:C.muted,padding:"5px 12px",cursor:"pointer",fontSize:11,width:"100%"}}>
                        + Add Subcontract Row
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>{/* end Row 2 */}

            {/* ── Row 3: Specifications & Notes (stacked) ── */}
            <div style={{...card,marginBottom:10,display:"flex",flexDirection:"column",gap:12}}>
              {/* Specifications */}
              <div>
                <div style={{fontSize:9,color:C.accent,fontWeight:700,letterSpacing:2,marginBottom:3}}>SPECIFICATIONS</div>
                <div style={{fontSize:9,color:C.dim,marginBottom:4}}>Auto-generated from enabled tests. Shown on quote PDF. Edit to override.</div>
                <textarea
                  value={ti.tiSpecs||""}
                  onChange={e=>{userEditedSpecs.current=true;setTi({...ti,tiSpecs:e.target.value})}}
                  placeholder="Enable test sections to auto-generate scope text, or type here..."
                  rows={5}
                  style={{...inp,width:"100%",resize:"vertical",fontSize:11,lineHeight:1.6}}/>
                {userEditedSpecs.current&&autoSpecs&&(
                  <button onClick={()=>{userEditedSpecs.current=false;setTi({...ti,tiSpecs:""});insertedAutoSpecs.current="";}}
                    style={{fontSize:9,color:C.dim,background:"none",border:"none",cursor:"pointer",padding:"2px 0",marginTop:2,display:"block"}}>
                    ↺ Reset to auto-generated
                  </button>
                )}
                {!userEditedSpecs.current&&autoSpecs&&(
                  <div style={{fontSize:9,color:C.green,marginTop:2}}>✓ Auto-generated specs active</div>
                )}
              </div>
              {/* Notes to customer */}
              <div>
                <div style={{fontSize:9,color:C.accent,fontWeight:700,letterSpacing:2,marginBottom:3}}>NOTES</div>
                <div style={{fontSize:9,color:C.dim,marginBottom:4}}>Customer-facing notes. Shown on quote PDF. Auto-populates based on selected tests.</div>
                <textarea
                  value={ti.tiNotes||""}
                  onChange={e=>{userEditedNotes.current=true;setTi({...ti,tiNotes:e.target.value})}}
                  placeholder="Notes will auto-populate based on selected tests..."
                  rows={5}
                  style={{...inp,width:"100%",resize:"vertical",fontSize:11,lineHeight:1.6}}/>
                {ti.tiNotes&&ti.tiNotes!==autoNotes&&(
                  <button onClick={()=>{userEditedNotes.current=false;setTi({...ti,tiNotes:""});insertedAutoNotes.current="";}}
                    style={{fontSize:9,color:C.dim,background:"none",border:"none",cursor:"pointer",padding:"2px 0",marginTop:2}}>
                    ↺ Reset to auto-generated
                  </button>
                )}
              </div>
            </div>

            {/* ── Row 4: Quote Summary — always interactive ── */}
            <div style={{...card,marginBottom:10,pointerEvents:"auto",position:"relative"}}>
              <div style={{fontSize:9,color:C.accent,fontWeight:700,letterSpacing:2,marginBottom:6}}>QUOTE SUMMARY</div>

              <div style={{pointerEvents:"auto",position:"relative"}}>
              {(isDirty||(currentQuoteId&&!locked))&&(
                <button onClick={()=>setShowProductPicker(true)}
                  style={{marginBottom:8,background:"#1a2332",border:"none",borderRadius:7,
                    padding:"6px 14px",color:"#fff",fontWeight:700,fontSize:11,cursor:"pointer",
                    display:"flex",alignItems:"center",gap:6,letterSpacing:.3}}>
                  + Add Line Items
                </button>
              )}
              </div>


              {qi.opp&&<div style={{fontSize:13,color:C.red,fontWeight:600,marginBottom:2,display:"flex",alignItems:"center",gap:6}}>
                {qi.opp}

              </div>}
              {(qi.billTo||qi.account)&&<div style={{fontSize:11,color:C.muted,marginBottom:4}}>{qi.billTo||qi.account}</div>}
              {qi.rfq&&<div style={{fontSize:10,color:C.dim,marginBottom:10}}>{"RFQ: "}{qi.rfq}</div>}
              {summary.lines.length===0&&pickerLines.length===0?(
                <div style={{color:C.border,fontSize:12,textAlign:"center",marginTop:30,marginBottom:30,lineHeight:1.8}}>
                  Click "+ Add Line Items" to build your quote
                </div>
              ):(
                <>
                  {/* Column headers */}
                  <div style={{display:"grid",gridTemplateColumns:"14px 36px 1fr 130px 80px 20px",gap:4,alignItems:"center",
                    borderBottom:"2px solid "+C.border,paddingBottom:4,marginBottom:4}}>
                    <span/>
                    <span style={{fontSize:9,color:C.dim,fontWeight:700}}>CODE</span>
                    <span style={{fontSize:9,color:C.dim,fontWeight:700}}>DESCRIPTION / NOTE</span>
                    <span style={{fontSize:9,color:C.dim,fontWeight:700}}></span>
                    <span style={{fontSize:9,color:C.dim,fontWeight:700,textAlign:"right"}}>AMOUNT</span>
                    <span/>
                  </div>
                  {(()=>{
                    const displayLines=summary.lines;
                    const autoOrder=lineOrder&&lineOrder.length===displayLines.length?lineOrder:displayLines.map((_,i)=>i);
                    const sidebarOvByIndex={};
                    const labelCount={};
                    Object.entries(lineOverrides).forEach(([k,ov])=>{ sidebarOvByIndex[k]=ov; });
                    displayLines.forEach(l=>{ labelCount[l.label]=(labelCount[l.label]||0)+1; });
                    const sidebarOvByLabel={};
                    Object.entries(lineOverrides).forEach(([k,ov])=>{
                      if(ov.label&&labelCount[ov.label]===1)sidebarOvByLabel[ov.label]=ov;
                    });
                    const autoRows=autoOrder.map((origIdx,dispIdx)=>{
                      const l=displayLines[origIdx];
                      if(!l)return null;
                      const ov=sidebarOvByIndex[origIdx]||sidebarOvByLabel[l.label]||{};
                      if(ov.deleted)return null;
                      return {type:"auto",origIdx,dispIdx,l,ov};
                    }).filter(Boolean);
                    const pickerRows=pickerLines.map((pl,pli)=>({type:"picker",pli,pl}));
                    // Build allRows: use unifiedOrder if set, else default auto-then-picker
                    let allRows;
                    if(unifiedOrder&&unifiedOrder.length===(autoRows.length+pickerRows.length)){
                      allRows=unifiedOrder.map(u=>{
                        if(u.type==='auto') return autoRows.find(r=>r.origIdx===u.origIdx);
                        else return pickerRows.find(r=>(r.pl.id||r.pl.label)===(u.id||u.label));
                      }).filter(Boolean);
                      // Fall back if any row not found (e.g. line was deleted)
                      if(allRows.length!==autoRows.length+pickerRows.length)
                        allRows=[...autoRows,...pickerRows];
                    } else {
                      allRows=[...autoRows,...pickerRows];
                    }
                    return allRows.map((row,uIdx)=>{
                      const isDragging=dragIdx===uIdx;
                      const isHover=!isDragging&&dragIdx!==null&&uIdx===pickerDragIdx;
                      const bg=isDragging?"#f0f4ff":isHover?"#e8f4fd":uIdx%2===0?"transparent":C.panel+"66";
                      const rowStyle={display:"grid",gridTemplateColumns:"14px 36px 1fr 130px 80px 20px",
                        gap:4,alignItems:"center",borderBottom:"1px solid "+C.border,
                        padding:"5px 0",background:bg,cursor:"grab",opacity:isDragging?0.5:1};
                      const onDS=e=>{
                        e.dataTransfer.effectAllowed="move";
                        dragFromRef.current=uIdx;
                        setDragIdx(uIdx);
                        setPickerDragIdx(null);
                      };
                      const onDO=e=>{
                        e.preventDefault();
                        e.dataTransfer.dropEffect="move";
                        dragToRef.current=uIdx;
                        setPickerDragIdx(uIdx);
                      };
                      const onDE=e=>{
                        const from=dragFromRef.current;
                        const to=dragToRef.current;
                        setDragIdx(null);
                        setPickerDragIdx(null);
                        dragFromRef.current=null;
                        dragToRef.current=null;
                        if(from===null||from===undefined||to===null||to===undefined||to===from){setIsDirty(true);return;}
                        // Use allRows from THIS render — indices are correct for this render
                        // Store identity keys (not indices) so future renders can match
                        const snap=[...allRows];
                        const [moved]=snap.splice(from,1);
                        const insertAt=from<to?to-1:to;
                        snap.splice(insertAt,0,moved);
                        // Store as identity keys: auto rows by origIdx, picker rows by id
                        const newUnifiedKeys=snap.map(r=>
                          r.type==='auto'
                            ?{type:'auto',origIdx:r.origIdx}
                            :{type:'picker',id:r.pl.id||r.pl.label}
                        );
                        setUnifiedOrder(newUnifiedKeys);
                        const newAutoOrder=snap.filter(r=>r.type==='auto').map(r=>r.origIdx);
                        const newPicker=snap.filter(r=>r.type==='picker').map(r=>r.pl);
                        if(newAutoOrder.length>0)setLineOrder(newAutoOrder);
                        setPickerLines(newPicker);
                        setIsDirty(true);
                      };
                      if(row.type==="auto"){
                        const {origIdx,l,ov}=row;
                        const dispPrice=ov.price!==undefined?ov.price:String(l.val);
                        const dispDesc=ov.desc!==undefined?ov.desc:"";
                        return(
                          <div key={"a"+origIdx} draggable onDragStart={onDS} onDragOver={onDO} onDragEnd={onDE} style={rowStyle}>
                            <span style={{fontSize:10,color:C.dim,cursor:"grab",userSelect:"none",textAlign:"center"}}>⠿</span>
                            <span style={{fontSize:9,color:"#6b7a8d",background:C.panel,borderRadius:3,padding:"2px 4px",fontFamily:"monospace",textAlign:"center",border:"1px solid "+C.border}}>{l.code||"—"}</span>
                            <div style={{minWidth:0}}>
                              <div style={{fontSize:11,color:C.text,fontWeight:500,lineHeight:1.3}}>{l.label}</div>
                              <input value={dispDesc}
                                onChange={e=>setLineOverrides({...lineOverrides,[origIdx]:{...ov,desc:e.target.value||undefined,label:l.label}})}
                                placeholder="+ line item description (optional)"
                                style={{width:"100%",fontSize:9,color:C.muted,background:"transparent",border:"none",outline:"none",padding:"1px 0",marginTop:1,fontStyle:dispDesc?"normal":"italic",boxSizing:"border-box"}}/>
                            </div>
                            <span/>
                            <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:2}}>
                              <span style={{fontSize:10,color:C.muted}}>$</span>
                              <input value={dispPrice}
                                onChange={e=>setLineOverrides({...lineOverrides,[origIdx]:{...ov,price:e.target.value,label:l.label}})}
                                style={{width:68,fontSize:12,fontWeight:700,color:C.text,fontFamily:"monospace",background:"transparent",border:"none",borderBottom:"1px solid "+C.border,outline:"none",textAlign:"right",padding:"1px 2px"}}/>
                            </div>
                            <button onClick={()=>setLineOverrides({...lineOverrides,[origIdx]:{...ov,deleted:true,label:l.label}})}
                              style={{background:"none",border:"none",color:C.dim,cursor:"pointer",fontSize:12,padding:0,lineHeight:1,textAlign:"center"}} title="Remove line">✕</button>
                          </div>
                        );
                      } else {
                        const {pl,pli}=row;
                        return(
                          <div key={"p"+pli} draggable onDragStart={onDS} onDragOver={onDO} onDragEnd={onDE} style={rowStyle}>
                            <span style={{fontSize:10,color:C.dim,cursor:"grab",userSelect:"none",textAlign:"center"}}>⠿</span>
                            <span style={{fontSize:9,color:"#6b7a8d",background:C.panel,borderRadius:3,padding:"2px 4px",fontFamily:"monospace",textAlign:"center",border:"1px solid "+C.border}}>{pl.code||"—"}</span>
                            <div style={{minWidth:0}}>
                              <div style={{fontSize:11,color:C.text,fontWeight:500,lineHeight:1.3}}>{pl.label}</div>
                              <input value={pl.desc||""}
                                onChange={e=>setPickerLines(prev=>prev.map((l,i)=>i===pli?{...l,desc:e.target.value}:l))}
                                placeholder="+ line item description (optional)"
                                style={{width:"100%",fontSize:9,color:C.muted,background:"transparent",border:"none",outline:"none",padding:"1px 0",marginTop:1,fontStyle:pl.desc?"normal":"italic",boxSizing:"border-box"}}/>
                            </div>
                            <span/>
                            <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:2}}>
                              <span style={{fontSize:10,color:C.muted}}>$</span>
                              <input value={String(pl.price||0)}
                                onChange={e=>setPickerLines(prev=>prev.map((l,i)=>i===pli?{...l,price:parseFloat(e.target.value)||0}:l))}
                                style={{width:68,fontSize:12,fontWeight:700,color:C.text,fontFamily:"monospace",background:"transparent",border:"none",borderBottom:"1px solid "+C.border,outline:"none",textAlign:"right",padding:"1px 2px"}}/>
                            </div>
                            <button onClick={()=>{
                              const plToRemove=pl;
                              setPickerLines(prev=>prev.filter((_,i)=>i!==pli));
                              setUnifiedOrder(prev=>prev?prev.filter(u=>!(u.type==='picker'&&(u.id||u.label)===(plToRemove.id||plToRemove.label))):null);
                            }}
                              style={{background:"none",border:"none",color:C.dim,cursor:"pointer",fontSize:12,padding:0,lineHeight:1,textAlign:"center"}} title="Remove line">✕</button>
                          </div>
                        );
                      }
                    });
                  })()}
                  {(Object.values(lineOverrides).some(o=>o.deleted)||lineOrder)&&(
                    <div style={{display:"flex",gap:10,marginTop:4}}>
                      {Object.values(lineOverrides).some(o=>o.deleted)&&(
                        <button onClick={()=>setLineOverrides({})}
                          style={{fontSize:9,color:C.dim,background:"none",border:"none",cursor:"pointer",padding:0}}>
                          ↺ Restore deleted lines
                        </button>
                      )}
                      {lineOrder&&(
                        <button onClick={()=>setLineOrder(null)}
                          style={{fontSize:9,color:C.dim,background:"none",border:"none",cursor:"pointer",padding:0}}>
                          ↺ Reset order
                        </button>
                      )}
                    </div>
                  )}
                  <div style={{marginTop:10,padding:"8px 0",borderTop:"2px solid "+C.red,
                    display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
                    <span style={{fontWeight:700,fontSize:13,color:C.text}}>TOTAL</span>
                    <span style={{fontWeight:700,fontSize:16,color:C.red,fontFamily:"monospace"}}>
                      {money(summary.lines.reduce((a,l,idx)=>{
                        const ov=lineOverrides[idx]||{};
                        if(ov.deleted)return a;
                        return a+(ov.price!==undefined?sf(ov.price):l.val);
                      },0)+(pickerLines||[]).reduce((a,l)=>a+(l.price||0),0))}
                    </span>
                  </div>
                  <div style={{pointerEvents:"auto",opacity:1}}>
                  <button onClick={exportPDF}
                    style={{width:"100%",marginTop:8,background:C.red,border:"none",borderRadius:8,
                      padding:"9px 0",color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer",letterSpacing:1}}>
                    EXPORT QUOTE PDF
                  </button>
                  {budget.on&&budget.rows.length>0&&(
                    <button onClick={exportBudgetPDF}
                      style={{width:"100%",marginTop:6,background:C.accent,border:"none",borderRadius:8,
                        padding:"9px 0",color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer",letterSpacing:1}}>
                      EXPORT BUDGET PDF
                    </button>
                  )}
                  {dcms.some(s=>s.on)&&(
                    <button onClick={exportDcMagPDF}
                      style={{width:"100%",marginTop:6,background:"#166534",border:"none",borderRadius:8,
                        padding:"9px 0",color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer",letterSpacing:1}}>
                      DC MAGNETICS — TEST SPECIFICATIONS
                    </button>
                  )}
                  {pqs.some(s=>s.on&&Object.entries(s.rows||{}).some(([k,v])=>v&&k.startsWith('B')))&&(
                    <button onClick={exportPq300bPDF}
                      style={{width:"100%",marginTop:6,background:"#1a5276",border:"none",borderRadius:8,
                        padding:"9px 0",color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer",letterSpacing:1}}>
                      PQ 300B — TEST SPECIFICATIONS
                    </button>
                  )}
                  {pqs.some(s=>s.on&&Object.entries(s.rows||{}).some(([k,v])=>v&&!k.startsWith('B')))&&(
                    <button onClick={exportPq300Part1PDF}
                      style={{width:"100%",marginTop:6,background:"#154360",border:"none",borderRadius:8,
                        padding:"9px 0",color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer",letterSpacing:1}}>
                      PQ 300 PART 1 — TEST SPECIFICATIONS
                    </button>
                  )}
                  {emis.some(s=>s.on&&Object.values(s.tests||{}).some(v=>v)&&(s.revs?.['Rev F']||!s.revs?.['Rev G']))&&(
                    <button onClick={exportEmi461fPDF}
                      style={{width:"100%",marginTop:6,background:"#4a1942",border:"none",borderRadius:8,
                        padding:"9px 0",color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer",letterSpacing:1}}>
                      461F — TEST SPECIFICATIONS
                    </button>
                  )}
                  {emis.some(s=>s.on&&Object.values(s.tests||{}).some(v=>v)&&(s.revs?.['Rev G']||!s.revs?.['Rev F']))&&(
                    <button onClick={exportEmi461gPDF}
                      style={{width:"100%",marginTop:6,background:"#1a3a4a",border:"none",borderRadius:8,
                        padding:"9px 0",color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer",letterSpacing:1}}>
                      461G — TEST SPECIFICATIONS
                    </button>
                  )}
                  </div>{/* end pointerEvents:auto buttons wrapper */}
                </>
              )}
            </div>{/* end Row 4 */}

            {/* ── Pricing & Instrumentation Calculators ── */}
            <PricingCalculator setup={setup} ti={ti}
              onExportEmiF={exportCalcEmi461fPDF}
              onExportEmiG={exportCalcEmi461gPDF}
              onExportPq300b={exportCalcPq300bPDF_calc}
              onExportPq300p1={exportCalcPq300Part1PDF_calc}/>
            <InstrumentationCalculator/>

            {/* ── Row 5+: Test sections ── */}
            <div>

            <Section title="OVERTIME" enabled={ot.on} onToggle={v=>setOt(v?{...ot,on:true}:{on:false,rows:[]})}>
              <OtForm s={ot} set={setOt}/>
            </Section>



            <Section title="CUSTOM LINE ITEMS" enabled={custom.on} onToggle={v=>setCustom(v?{...custom,on:true}:{on:false,rows:[]})}>
              <CustomForm s={custom} set={setCustom}/>
            </Section>

            {/* Advanced Mode — auto-calc test sections */}
            <div style={{marginBottom:8,border:"1px solid #e0e4ea",borderRadius:10,overflow:"hidden"}}>
              <div style={{background:"#f8f9fb",padding:"10px 14px",display:"flex",alignItems:"center",
                justifyContent:"space-between",cursor:"pointer",borderBottom:advancedModeOpen?"1px solid #e0e4ea":"none"}}
                onClick={()=>setAdvancedModeOpen(v=>!v)}>
                <div>
                  <span style={{fontSize:12,fontWeight:700,color:"#1a2332",letterSpacing:.2}}>Advanced Mode</span>
                  <span style={{fontSize:10,color:"#9aa5b1",marginLeft:8}}>— auto-calculating test forms</span>
                </div>
                <span style={{fontSize:12,color:"#9aa5b1"}}>{advancedModeOpen?"▲":"▼"}</span>
              </div>
              {advancedModeOpen&&(
                <div style={{padding:"8px 0"}}>
                  <MultiSection title="VIBRATION  (MIL-STD-167)" instances={vibs}
                    onAdd={mkAdder(vibs,setVibs,newVib)}
                    onRemove={mkRemover(vibs,setVibs)}
                    onUpdate={mkUpdater(vibs,setVibs)}
                    newInstance={newVib}
                    Form={VibForm} formProps={setupProps}/>

                  <MultiSection title="SHOCK TESTING  (MIL-STD-901)" instances={shocks}
                    onAdd={mkAdder(shocks,setShocks,newShock)}
                    onRemove={mkRemover(shocks,setShocks)}
                    onUpdate={mkUpdater(shocks,setShocks)}
                    newInstance={newShock}
                    Form={ShockForm} formProps={{vibSetup,ti,...setupProps}}/>

                  <Section title="INSTRUMENTATION" enabled={inst.on} onToggle={v=>setInst(v?{...inst,on:true}:{on:false,items:{}})}>
                    <InstForm s={inst} set={setInst}/>
                  </Section>

                  <MultiSection title="NOISE SUSCEPTIBILITY  (MIL-STD-810)" instances={noises}
                    onAdd={mkAdder(noises,setNoises,newNoise)}
                    onRemove={mkRemover(noises,setNoises)}
                    onUpdate={mkUpdater(noises,setNoises)}
                    newInstance={newNoise}
                    Form={NoiseForm} formProps={{ti,...setupProps}}/>

                  <MultiSection title="ENVIRONMENTAL TESTING" instances={envs}
                    onAdd={mkAdder(envs,setEnvs,newEnv)}
                    onRemove={mkRemover(envs,setEnvs)}
                    onUpdate={mkUpdater(envs,setEnvs)}
                    newInstance={newEnv}
                    Form={EnvForm} formProps={{}}/>

                  <MultiSection title="HIGH FREQUENCY VIBRATION" instances={hfvs}
                    onAdd={mkAdder(hfvs,setHfvs,newHfv)}
                    onRemove={mkRemover(hfvs,setHfvs)}
                    onUpdate={mkUpdater(hfvs,setHfvs)}
                    newInstance={newHfv}
                    Form={HfvForm} formProps={setupProps}/>

                  <MultiSection title="SHOCK (OTHER)" instances={shos}
                    onAdd={mkAdder(shos,setShos,newSho)}
                    onRemove={mkRemover(shos,setShos)}
                    onUpdate={mkUpdater(shos,setShos)}
                    newInstance={newSho}
                    Form={ShoForm} formProps={setupProps}/>

            <MultiSection title="EMI TESTING  (MIL-STD-461)" tag="SHIFTS" instances={emis}
              onAdd={mkAdder(emis,setEmis,newEmi)}
              onRemove={mkRemover(emis,setEmis)}
              onUpdate={mkUpdater(emis,setEmis)}
              newInstance={newEmi}
              Form={EmiForm} formProps={{ti}}/>

            <MultiSection title="POWER QUALITY  (MIL-STD-1399)" tag="SHIFTS" instances={pqs}
              onAdd={mkAdder(pqs,setPqs,newPq)}
              onRemove={mkRemover(pqs,setPqs)}
              onUpdate={mkUpdater(pqs,setPqs)}
              newInstance={newPq}
              Form={PqForm} formProps={{ti}}/>

            <MultiSection title="DC MAGNETICS" tag="SHIFTS" instances={dcms}
              onAdd={mkAdder(dcms,setDcms,newDcm)}
              onRemove={mkRemover(dcms,setDcms)}
              onUpdate={mkUpdater(dcms,setDcms)}
              newInstance={newDcm}
              Form={DcmForm} formProps={{}}/>

                  <MultiSection title="AIRBORNE NOISE" instances={abs}
                    onAdd={mkAdder(abs,setAbs,newAb)}
                    onRemove={mkRemover(abs,setAbs)}
                    onUpdate={mkUpdater(abs,setAbs)}
                    newInstance={newAb}
                    Form={AbForm} formProps={setupProps}/>

                  <MultiSection title="STRUCTUREBORNE NOISE" instances={sbs}
                    onAdd={mkAdder(sbs,setSbs,newSb)}
                    onRemove={mkRemover(sbs,setSbs)}
                    onUpdate={mkUpdater(sbs,setSbs)}
                    newInstance={newSb}
                    Form={SbForm} formProps={setupProps}/>
                </div>
              )}
            </div>


          </div>{/* end pointer-events wrapper */}
            </div>{/* end test sections lock wrapper */}


        </div>{/* end left scroll column */}

      </>)}{/* end dashboard/form conditional */}
      </div>{/* end body flex row */}

      {/* ── Product Picker Modal ── */}
      {showProductPicker&&(
        <ProductPicker
          onAdd={handleProductPickerAdd}
          onClose={()=>setShowProductPicker(false)}
          setup={setup}
          ti={ti}
          vibs={vibs}
          hfvs={hfvs}
          summary={summary}
        />
      )}

      {/* ── Chatter panel ── */}
      {showChatter&&<div onClick={()=>setShowChatter(false)} style={{position:"fixed",inset:0,zIndex:1100,background:"rgba(0,0,0,0.25)"}}/>}
      <div style={{position:"fixed",top:0,right:showChatter?0:-440,width:420,bottom:0,zIndex:1150,
        background:"#fff",boxShadow:"-4px 0 24px rgba(0,0,0,0.15)",transition:"right 0.3s ease",
        display:"flex",flexDirection:"column",fontFamily:"Segoe UI,system-ui,sans-serif"}}>
        {/* Header */}
        <div style={{background:"#1a5276",padding:"14px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <div>
            <div style={{fontWeight:700,fontSize:14,color:"#fff",letterSpacing:.5}}>💬 Chatter</div>
            <div style={{fontSize:10,color:"rgba(255,255,255,0.6)",marginTop:2}}>{qi?.opp||"(no opportunity)"} · {chatterEntries.length} entr{chatterEntries.length===1?"y":"ies"}</div>
          </div>
          <button onClick={()=>setShowChatter(false)} style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:6,color:"#fff",fontSize:16,cursor:"pointer",padding:"4px 10px",fontWeight:700}}>✕</button>
        </div>
        {/* Entries */}
        <div style={{flex:1,overflowY:"auto",padding:"14px 16px",display:"flex",flexDirection:"column",gap:10}}>
          {chatterEntries.length===0?(
            <div style={{textAlign:"center",color:"#9aa5b1",fontSize:13,padding:"40px 20px",lineHeight:1.8}}>
              No entries yet.<br/>Be the first to add a note.
            </div>
          ):(
            [...chatterEntries].reverse().map((e,i)=>(
              <div key={i} style={{background:"#f8f9fa",borderRadius:8,padding:"10px 13px",
                border:"1px solid #e8ecf0"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                  <span style={{fontSize:11,fontWeight:700,color:"#1a5276"}}>{e.by||"Unknown"}</span>
                  <span style={{fontSize:10,color:"#9aa5b1"}}>
                    {e.at?new Date(e.at).toLocaleString("en-US",{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"}):""}
                  </span>
                </div>
                <div style={{fontSize:12,color:"#1a2332",lineHeight:1.6,whiteSpace:"pre-wrap"}}>{e.msg}</div>
              </div>
            ))
          )}
        </div>
        {/* Input */}
        <div style={{padding:"12px 16px",borderTop:"1px solid #e8ecf0",flexShrink:0,background:"#f8f9fa"}}>
          {!currentQuoteId&&(
            <div style={{fontSize:11,color:"#b7791f",marginBottom:8,background:"#fffbeb",borderRadius:6,padding:"6px 10px",border:"1px solid #f6d860"}}>
              ⚠️ Save the quote first before adding chatter.
            </div>
          )}
          <textarea
            value={chatterInput}
            onChange={e=>setChatterInput(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter"&&(e.metaKey||e.ctrlKey))document.getElementById("chatter-post-btn")?.click();}}
            placeholder="Add a note, update, or question… (Ctrl+Enter to post)"
            rows={3}
            style={{width:"100%",fontSize:12,borderRadius:7,border:"1px solid #d0d7de",padding:"8px 10px",
              resize:"none",fontFamily:"inherit",boxSizing:"border-box",outline:"none",lineHeight:1.6}}
          />
          <div style={{display:"flex",justifyContent:"flex-end",marginTop:8}}>
            <button id="chatter-post-btn"
              disabled={!chatterInput.trim()||!currentQuoteId||chatterSaving}
              onClick={async()=>{
                if(!chatterInput.trim()||!currentQuoteId)return;
                setChatterSaving(true);
                const entry={by:currentUser,at:new Date().toISOString(),msg:chatterInput.trim()};
                const updated=[...chatterEntries,entry];
                setChatterEntries(updated);
                setChatterInput("");
                // Save immediately so chatter persists without requiring manual SAVE
                const q={id:currentQuoteId,opp:qi.opp,customer:qi.account,rfq:qi.rfq,total:displayTotal,
                  qi,ti,vibs,shocks,noises,envs,hfvs,shos,dcms,pqs,emis,abs,sbs,inst,ot,custom,budget,coc,sub,td,setup,globalPR,notes,splitProcReport,modalAnalysis,fixtureDrawing,inStockModal,wonInfo,approval,wonApproval,chatterEntries:updated,summary,lineOrder,lineOverrides,pickerLines,unifiedOrder};
                await saveQuoteToSupabase(q,autoSpecs,autoNotes);
                setChatterSaving(false);
              }}
              style={{background:!chatterInput.trim()||!currentQuoteId?"#e8ecf0":"#1a5276",
                border:"none",borderRadius:7,padding:"7px 20px",fontWeight:700,fontSize:12,
                cursor:!chatterInput.trim()||!currentQuoteId?"default":"pointer",
                color:!chatterInput.trim()||!currentQuoteId?"#9aa5b1":"#fff",
                display:"flex",alignItems:"center",gap:6}}>
              {chatterSaving?"Saving…":"💬 Post"}
            </button>
          </div>
        </div>
      </div>

      {toast&&(
        <div style={{
          position:"fixed",bottom:24,right:24,zIndex:9999,
          background:toast.type==="error"?"#c0392b":toast.type==="info"?"#1a5276":"#1e8449",
          color:"#fff",borderRadius:10,padding:"12px 20px",
          boxShadow:"0 4px 20px rgba(0,0,0,0.25)",
          fontSize:13,fontWeight:600,
          display:"flex",alignItems:"center",gap:10,
          animation:"fadeInUp 0.2s ease",
          maxWidth:340,
        }}>
          <span>{toast.type==="error"?"⚠️":toast.type==="info"?"ℹ️":"✓"}</span>
          <span>{toast.msg}</span>
          <button onClick={()=>setToast(null)}
            style={{background:"none",border:"none",color:"rgba(255,255,255,0.7)",
              cursor:"pointer",fontSize:16,padding:0,marginLeft:4,lineHeight:1}}>
            ×
          </button>
        </div>
      )}

      {/* ── Reminders slide-out panel ── */}
      {openQuotesPanel&&(
        <div onClick={()=>setOpenQuotesPanel(false)}
          style={{position:"fixed",inset:0,zIndex:1100,background:"rgba(0,0,0,0.25)"}}/>
      )}
      <div
        onClick={()=>{if(!openQuotesPanel){setOpenQuotesPanel(true);loadOpenQuotes();}else setOpenQuotesPanel(false);}}
        style={{position:"fixed",left:openQuotesPanel?380:0,top:"50%",transform:"translateY(-50%)",zIndex:1200,background:"#1a5276",color:"#fff",borderRadius:"0 6px 6px 0",padding:"8px 5px",cursor:"pointer",transition:"left 0.3s ease",writingMode:"vertical-rl",textOrientation:"mixed",fontSize:9,fontWeight:700,letterSpacing:1,boxShadow:"2px 0 8px rgba(0,0,0,0.2)",userSelect:"none",display:"flex",alignItems:"center",gap:4}}>
        <span style={{fontSize:11}}>📂</span>
        <span>REMINDERS</span>
      </div>
      <div style={{position:"fixed",left:openQuotesPanel?0:-400,top:0,bottom:0,width:380,background:"#ffffff",zIndex:1150,boxShadow:"4px 0 24px rgba(0,0,0,0.18)",transition:"left 0.3s ease",display:"flex",flexDirection:"column",fontFamily:"Segoe UI,system-ui,sans-serif"}}>
        <div style={{background:"#1a5276",padding:"14px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <div>
            <div style={{fontWeight:700,fontSize:14,color:"#fff",letterSpacing:.5}}>📌 Reminders</div>
            <div style={{fontSize:10,color:"rgba(255,255,255,0.6)",marginTop:2}}>Click an opportunity number to load</div>
          </div>
          <button onClick={()=>setOpenQuotesPanel(false)} style={{background:"rgba(255,255,255,0.15)",border:"none",borderRadius:6,color:"#fff",fontSize:16,cursor:"pointer",padding:"4px 10px",fontWeight:700}}>✕</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 28px",gap:4,padding:"8px 12px",background:"#e8ecf0",borderBottom:"2px solid #d0d7de",flexShrink:0}}>
          {["Opportunity #","Account","Description",""].map((h,i)=>(
            <div key={i} style={{fontSize:9,color:"#9aa5b1",fontWeight:700,letterSpacing:.8}}>{h}</div>
          ))}
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"8px 12px"}}>
          {openQuotesLoading&&<div style={{textAlign:"center",color:"#9aa5b1",fontSize:12,padding:20}}>Loading…</div>}
          {!openQuotesLoading&&openQuotesList.length===0&&(
            <div style={{textAlign:"center",color:"#9aa5b1",fontSize:12,padding:30,lineHeight:1.8}}>No reminders yet.<br/>Click + Add Row to get started.</div>
          )}
          {openQuotesList.map(row=>(
            <div key={row.id}
              draggable
              onDragStart={()=>handleOpenQuoteDragStart(row.id)}
              onDragOver={e=>{e.preventDefault();setDragOverId(row.id);}}
              onDragLeave={()=>setDragOverId(null)}
              onDrop={()=>handleOpenQuoteDrop(row.id)}
              style={{marginBottom:8,background:dragOverId===row.id?"#d0e8f7":"#e8ecf0",borderRadius:7,padding:"8px 10px",
                border:"1px solid "+(dragOverId===row.id?"#1a5276":"#d0d7de"),
                cursor:"grab",transition:"background 0.15s,border 0.15s"}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                <span style={{color:"#b0b8c4",fontSize:13,cursor:"grab",flexShrink:0}}>⠿</span>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 28px",gap:4,flex:1,alignItems:"center"}}>
                  <input value={row.account||""} onChange={e=>updateOpenQuoteRow(row.id,"account",e.target.value)} placeholder="Account" style={{background:"#f8f9fa",border:"1px solid #d0d7de",borderRadius:6,padding:"4px 8px",fontSize:11,outline:"none",fontFamily:"inherit",boxSizing:"border-box",width:"100%"}}/>
                  <input value={row.description||""} onChange={e=>updateOpenQuoteRow(row.id,"description",e.target.value)} placeholder="Brief description" style={{background:"#f8f9fa",border:"1px solid #d0d7de",borderRadius:6,padding:"4px 8px",fontSize:11,outline:"none",fontFamily:"inherit",boxSizing:"border-box",width:"100%"}}/>
                  <button onClick={()=>deleteOpenQuoteRow(row.id)} style={{background:"none",border:"none",color:"#9aa5b1",cursor:"pointer",fontSize:13,padding:0,textAlign:"center"}} title="Remove row">✕</button>
                </div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6,paddingLeft:19}}>
                <span
                  onClick={()=>handleOpenQuoteClick(row)}
                  title={row.opportunity?"Load quote: "+row.opportunity:"Enter an opportunity number first"}
                  style={{fontSize:12,fontWeight:700,color:row.opportunity?"#1a5276":"#9aa5b1",cursor:row.opportunity?"pointer":"default",textDecoration:row.opportunity?"underline":"none",flex:"0 0 auto",minWidth:0}}>
                  {row.opportunity||"—"}
                </span>
                <input value={row.opportunity||""} onChange={e=>updateOpenQuoteRow(row.id,"opportunity",e.target.value)} placeholder="Opportunity #" style={{background:"#f8f9fa",border:"1px solid #d0d7de",borderRadius:6,padding:"4px 8px",fontSize:11,outline:"none",fontFamily:"inherit",boxSizing:"border-box",flex:1}}/>
              </div>
            </div>
          ))}
        </div>
        <div style={{padding:"10px 12px",borderTop:"1px solid #d0d7de",flexShrink:0}}>
          <button onClick={addOpenQuoteRow} style={{width:"100%",background:"none",border:"1px dashed #d0d7de",borderRadius:7,color:"#1a5276",padding:"8px 0",cursor:"pointer",fontSize:12,fontWeight:600}}>+ Add Row</button>
        </div>
      </div>

    </div>
  );
}
