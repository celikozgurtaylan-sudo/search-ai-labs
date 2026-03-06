import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface InvitationEmailRequest {
  participantEmail: string;
  participantName?: string;
  invitationToken: string;
  projectTitle?: string;
  expiresAt: string;
  studyType?: 'mobile-usability' | 'desktop-research' | 'general';
  targetDevice?: 'mobile' | 'desktop' | 'both';
  projectDescription?: string;
}

const createEmailTemplate = (
  participantName: string, 
  invitationToken: string, 
  projectTitle: string, 
  expiresAt: string,
  studyType: string = 'general',
  targetDevice: string = 'both',
  projectDescription?: string
) => {
  // Get frontend URL with fallback
  const frontendUrl = Deno.env.get('FRONTEND_URL') || 'https://searcho.lovable.app';
  console.log('Frontend URL:', frontendUrl);
  
  const invitationLink = `${frontendUrl}/join/research/${invitationToken}`;
  console.log('Generated invitation link:', invitationLink);
  
  const expirationDate = new Date(expiresAt).toLocaleDateString('tr-TR');
  
  // Dynamic content based on study type and target device
  const getContextualMessage = () => {
    if (studyType === 'mobile-usability' && targetDevice === 'mobile') {
      return `
        <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <h4 style="color: #856404; margin: 0 0 8px 0; font-size: 14px;">📱 Önemli: Mobil Test</h4>
          <p style="color: #856404; margin: 0; font-size: 14px;">
            Bu araştırma mobil deneyim odaklıdır. Lütfen katılımdan önce:
          </p>
          <ul style="color: #856404; margin: 8px 0 0 0; font-size: 14px;">
            <li>Telefonunuzdan bu davetiyeye tıklayın</li>
            <li>Test edilecek uygulamanın telefonunuzda yüklü olduğundan emin olun</li>
            <li>Stabil internet bağlantınızı kontrol edin</li>
            <li>Mikrofon ve kameranıza erişim izni verin</li>
          </ul>
        </div>`;
    }
    
    if (studyType === 'desktop-research' && targetDevice === 'desktop') {
      return `
        <div style="background-color: #e3f2fd; border: 1px solid #90caf9; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <h4 style="color: #1565c0; margin: 0 0 8px 0; font-size: 14px;">💻 Masaüstü Araştırması</h4>
          <p style="color: #1565c0; margin: 0; font-size: 14px;">
            Bu araştırma masaüstü deneyimi üzerine odaklanmaktadır. En iyi deneyim için bilgisayarınızdan katılın.
          </p>
        </div>`;
    }
    
    return '';
  };

  const getFormatDescription = () => {
    if (studyType === 'mobile-usability') {
      return 'Mobil kullanılabilirlik testi ve sesli görüşme';
    }
    if (studyType === 'desktop-research') {
      return 'Masaüstü araştırması ve görüşme';
    }
    return 'Online görüşme ve kullanıcı deneyimi araştırması';
  };

  return `
    <!DOCTYPE html>
    <html lang="tr">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Araştırma Davetiyesi</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          color: #333333;
          background-color: #f8fafc;
        }
        
        .container {
          max-width: 600px;
          margin: 0 auto;
          background-color: #ffffff;
          border-radius: 12px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          overflow: hidden;
        }
        
        .header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          padding: 40px 20px;
          text-align: center;
          color: white;
        }
        
        .header h1 {
          font-size: 28px;
          font-weight: 600;
          margin-bottom: 8px;
        }
        
        .header p {
          font-size: 16px;
          opacity: 0.9;
        }
        
        .content {
          padding: 40px 30px;
        }
        
        .greeting {
          font-size: 18px;
          color: #2d3748;
          margin-bottom: 20px;
        }
        
        .message {
          font-size: 16px;
          color: #4a5568;
          margin-bottom: 30px;
          line-height: 1.7;
        }
        
        .project-info {
          background-color: #f7fafc;
          padding: 20px;
          border-radius: 8px;
          border-left: 4px solid #667eea;
          margin-bottom: 30px;
        }
        
        .project-info h3 {
          color: #2d3748;
          margin-bottom: 8px;
          font-size: 16px;
        }
        
        .project-info p {
          color: #718096;
          font-size: 14px;
        }
        
        .cta-button {
          display: inline-block;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 16px 32px;
          text-decoration: none;
          border-radius: 8px;
          font-weight: 600;
          font-size: 16px;
          text-align: center;
          transition: transform 0.2s;
          box-shadow: 0 2px 4px rgba(102, 126, 234, 0.3);
        }
        
        .cta-button:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 8px rgba(102, 126, 234, 0.4);
        }
        
        .button-container {
          text-align: center;
          margin: 30px 0;
        }
        
        .details {
          background-color: #fafafa;
          padding: 20px;
          border-radius: 8px;
          margin-top: 30px;
        }
        
        .details h4 {
          color: #2d3748;
          margin-bottom: 12px;
          font-size: 14px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        
        .details ul {
          list-style: none;
          margin: 0;
        }
        
        .details li {
          color: #718096;
          font-size: 14px;
          margin-bottom: 8px;
          padding-left: 16px;
          position: relative;
        }
        
        .details li::before {
          content: "•";
          color: #667eea;
          font-weight: bold;
          position: absolute;
          left: 0;
        }
        
        .footer {
          background-color: #2d3748;
          color: #a0aec0;
          padding: 25px 30px;
          text-align: center;
          font-size: 14px;
        }
        
        .expiration {
          background-color: #fff5f5;
          border: 1px solid #feb2b2;
          color: #c53030;
          padding: 12px 16px;
          border-radius: 6px;
          font-size: 14px;
          margin-top: 20px;
          text-align: center;
        }
        
        @media (max-width: 600px) {
          .container {
            border-radius: 0;
            margin: 0;
          }
          
          .header {
            padding: 30px 20px;
          }
          
          .content {
            padding: 30px 20px;
          }
          
          .footer {
            padding: 20px;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🔬 Araştırma Davetiyesi</h1>
          <p>Değerli görüşlerinizi paylaşın</p>
        </div>
        
        <div class="content">
          <div class="greeting">
            Merhaba ${participantName ? participantName : 'Değerli Katılımcı'},
          </div>
          
          <div class="message">
            Kullanıcı deneyimi araştırmamıza katılmanız için sizi davet ediyoruz. Görüşleriniz, 
            ürünümüzü geliştirmemiz ve daha iyi bir deneyim sunmamız için çok değerli.
          </div>
          
          ${getContextualMessage()}
          
          <div class="project-info">
            <h3>📋 Araştırma Detayları</h3>
            <p><strong>Proje:</strong> ${projectTitle || 'Kullanıcı Deneyimi Araştırması'}</p>
            ${projectDescription ? `<p><strong>Açıklama:</strong> ${projectDescription}</p>` : ''}
            <p><strong>Tahmini Süre:</strong> 15-30 dakika</p>
            <p><strong>Format:</strong> ${getFormatDescription()}</p>
          </div>
          
          <div class="button-container">
            <a href="${invitationLink}" class="cta-button">
              🚀 Araştırmaya Katıl
            </a>
          </div>
          
          <div class="details">
            <h4>Neler Yapacağız?</h4>
            <ul>
              <li>Kısa bir tanışma ve geçmiş deneyimleriniz hakkında sohbet</li>
              <li>Ürün/hizmetimizle ilgili görüş ve önerilerinizi dinleme</li>
              <li>Kullanıcı deneyimini iyileştirmek için geri bildirim toplama</li>
              <li>Sorularınızı yanıtlama ve tartışma</li>
            </ul>
          </div>
          
          <div class="expiration">
            ⏰ Bu davet ${expirationDate} tarihine kadar geçerlidir.
          </div>
        </div>
        
        <div class="footer">
          <p>Bu e-posta, kullanıcı araştırması davetiyesi için gönderilmiştir.</p>
          <p>Katılım tamamen gönüllüdür ve istediğiniz zaman araştırmadan çıkabilirsiniz.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      participantEmail, 
      participantName, 
      invitationToken, 
      projectTitle, 
      expiresAt, 
      studyType = 'general',
      targetDevice = 'both',
      projectDescription 
    }: InvitationEmailRequest = await req.json();

    if (!participantEmail || !invitationToken) {
      return new Response(
        JSON.stringify({ error: "participantEmail and invitationToken are required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    console.log('Sending invitation email to:', participantEmail);
    console.log('Invitation token:', invitationToken);

    const emailHtml = createEmailTemplate(
      participantName || participantEmail.split('@')[0], 
      invitationToken, 
      projectTitle || 'Kullanıcı Deneyimi Araştırması',
      expiresAt,
      studyType,
      targetDevice,
      projectDescription
    );

    const emailResponse = await resend.emails.send({
      from: 'UX Araştırma <onboarding@resend.dev>',
      to: [participantEmail],
      subject: `🔬 Araştırma Davetiyesi - ${projectTitle || 'UX Araştırması'}`,
      html: emailHtml,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ 
      success: true, 
      messageId: emailResponse.data?.id,
      message: 'Davet e-postası başarıyla gönderildi'
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in send-invitation-email function:", error);
    
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false,
        message: 'E-posta gönderilirken hata oluştu'
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);