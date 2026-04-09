export async function sendInvitationEmail(toEmail: string, token: string, projectId: string, ftmId: string) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    console.warn("RESEND_API_KEY is not defined. Email will not be sent to", toEmail);
    return;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  // As per domain rules, standard guest access URL
  const magicLink = `${appUrl}/invite/${token}?projectId=${projectId}&ftmId=${ftmId}`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: "FTM App <notifications@ftm.example.com>",
      to: [toEmail],
      subject: "Invitation à contribuer - Études FTM",
      html: `
        <h2>Bonjour,</h2>
        <p>Vous avez été invité à participer aux études pour une Fiche de Travaux Modificatifs (FTM).</p>
        <p>Veuillez utiliser ce lien sécurisé pour accéder au dossier. Ce lien est valide pendant 72 heures :</p>
        <p><a href="${magicLink}">${magicLink}</a></p>
        <br/>
        <p>L'équipe Gestion Financière Courtier</p>
      `
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("Failed to send email via Resend:", response.status, errorBody);
    throw new Error("Unable to send invitation email.");
  }
}
