const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function texto(v: unknown): string {
  return String(v ?? "").trim();
}

function htmlEscape(v: unknown): string {
  return texto(v)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ success: false, error: "Método não permitido." }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) throw new Error("Secret RESEND_API_KEY não configurado.");

    const body = await req.json();
    const destinatario = texto(body.destinatario).toLowerCase();
    const nomeRevisor = texto(body.nome_revisor);
    const name = texto(body.name);
    const titulo = texto(body.titulo);
    const semestre = texto(body.semestre_oferta);
    const pdfBase64 = texto(body.pdf_base64);
    const nomeArquivo = texto(body.nome_arquivo) || "certificado.pdf";

    if (!destinatario || !destinatario.includes("@")) throw new Error("Destinatário inválido.");
    if (!pdfBase64) throw new Error("PDF do certificado não informado.");
    if (!/^UNIDADE\s*0?[1-8]\b/i.test(name)) {
      throw new Error("Envio permitido somente para certificados de Unidades de Aprendizagem (UA)." );
    }

    const assunto = "Certificado revisão de Material Didático Digital";
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#2d1553;line-height:1.6;font-size:15px">
        <p>Olá, <strong>${htmlEscape(nomeRevisor)}</strong>!</p>
        <p>Agradecemos sua participação no processo de revisão dos materiais didáticos digitais do Ecossistema Ânima.</p>
        <p>Encaminhamos em anexo seu certificado referente à revisão da <strong>Unidade de Aprendizagem ${htmlEscape(name)}</strong>, vinculada a <strong>${htmlEscape(titulo)}</strong>, no período de <strong>${htmlEscape(semestre)}</strong>.</p>
        <p>Sua contribuição foi muito importante para assegurar a qualidade acadêmica e técnica dos nossos materiais.</p>
        <p>Atenciosamente,<br><strong>Equipe Sintechtica | VPA</strong></p>
      </div>`;

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Qualidade Sintechtica <onboarding@resend.dev>",
        to: [destinatario],
        reply_to: "qualidadesintechtica@animaeducacao.com.br",
        subject: assunto,
        html,
        attachments: [{ filename: nomeArquivo, content: pdfBase64 }],
      }),
    });

    const out = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return new Response(JSON.stringify({ success: false, error: "Falha no envio pelo Resend.", detalhe: out }), {
        status: resp.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, resend_id: out?.id ?? null }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
