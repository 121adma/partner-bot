const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes } = require('discord.js');
require('dotenv').config(); // .env dosyasını yükler

// --- AYARLARIN .env'DEN ÇEKİLMESİ ---
const TOKEN = process.env.BOT_TOKEN;
const PARTNER_YETKILI_ROL_ID = process.env.PARTNER_YETKILI_ROL_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const PARTNER_DUYURU_KANAL_ID = process.env.PARTNER_DUYURU_KANAL_ID; 

// --- KULLANICI HAKLARI (BELLEK İÇİ DEPOLAMA) ---
// UYARI: Bot yeniden başlatıldığında bu veriler SIFIRLANIR.
const userPartnerRights = {}; 

// Bot istemcisini oluşturma
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// -------------------------------------------------------------------
// --- YARDIMCI FONKSİYONLAR ---
// -------------------------------------------------------------------

/**
 * Belirlenen Log Kanalına (LOG_CHANNEL_ID) bir embed mesajı gönderir.
 */
async function sendLog(client, title, description, fields = [], color = 0xffa500) {
    if (!LOG_CHANNEL_ID) return console.error("LOG_CHANNEL_ID .env dosyasında ayarlanmamış.");
    
    try {
        const logChannel = await client.channels.fetch(LOG_CHANNEL_ID);
        if (!logChannel) return console.error(`Log kanalı (ID: ${LOG_CHANNEL_ID}) bulunamadı.`);

        const logEmbed = {
            color: color, 
            title: title,
            description: description,
            fields: fields,
            timestamp: new Date().toISOString(),
        };
        await logChannel.send({ embeds: [logEmbed] });
    } catch (error) {
        console.error('Log kanalına mesaj gönderilirken bir hata oluştu:', error);
    }
}


// --- KOMUT VERİLERİ (SLASH COMMANDS) ---

const commands = [
    new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Botun gecikme süresini (latency) gösterir.')
        .toJSON(),

    new SlashCommandBuilder()
        .setName('partner')
        .setDescription('Sunucunuzun partnerlik duyurusunu yapar.')
        .addStringOption(option =>
            option.setName('davet-linki')
                .setDescription('Partner sunucunun davet linki.')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('mesaj')
                .setDescription('Partnerlik mesajının içeriği.')
                .setRequired(true))
        .toJSON(),
        
    new SlashCommandBuilder()
        .setName('partnerhak')
        .setDescription('Belirtilen kullanıcıya partnerlik kullanım hakkı ekler/ayarlar.')
        .addUserOption(option =>
            option.setName('kullanici')
                .setDescription('Hak ayarlanacak kullanıcı.')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('hak-sayisi')
                .setDescription('Kullanıcıya verilecek yeni hak sayısı (0 ve üzeri).')
                .setRequired(true)
                .setMinValue(0))
        .toJSON(),
];


// --- HAZIRLIK OLAYI (Bot açıldığında) ---

client.on('ready', async () => {
    console.log(`Bot başarılı bir şekilde giriş yaptı: ${client.user.tag}!`);

    // Komutları Discord'a kaydetme
    const rest = new REST({ version: '10' }).setToken(TOKEN);

    try {
        console.log('(/) Uygulama komutları kaydediliyor...');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands },
        );
        console.log('(/) Uygulama komutları başarıyla kaydedildi.');
    } catch (error) {
        console.error('Komutlar kaydedilirken bir hata oluştu:', error);
    }
});

// -------------------------------------------------------------------

// --- KOMUT İŞLEMLERİ ---

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const { commandName } = interaction;
    const member = interaction.member;

    // Yetkili Rol Kontrolü değişkeni
    const isPartnerStaff = PARTNER_YETKILI_ROL_ID && member.roles.cache.has(PARTNER_YETKILI_ROL_ID);


    // --- /partnerhak Komutu ---
    if (commandName === 'partnerhak') {
        
        // Sadece PARTNER YETKİLİSİ ROLÜ olanlar kullanabilir (Yetki Kontrolü)
        if (!isPartnerStaff) {
            await interaction.reply({ 
                content: 'Bu komutu kullanmak için ayarlanan **Partner Yetkilisi Rolü**ne sahip olmalısınız.', 
                ephemeral: true 
            });
            return;
        }

        // Unknown Interaction hatasını engellemek için deferReply kullanılır.
        await interaction.deferReply({ ephemeral: false }); 
        
        const kullanici = interaction.options.getUser('kullanici');
        const hakSayisi = interaction.options.getInteger('hak-sayisi');
        const oldHakSayisi = userPartnerRights[kullanici.id] || 0; 

        userPartnerRights[kullanici.id] = hakSayisi;
        
        await sendLog(client, 'Partner Hak Güncelleme (LOG)', 
            `**Partner Hakları Başarıyla Ayarlandı**`,
            [
                { name: 'Yetkiyi Ayarlayan', value: `${interaction.user.tag}`, inline: false },
                { name: 'Kullanıcı', value: `${kullanici.tag} (${kullanici.id})`, inline: true },
                { name: 'Yeni Hak Sayısı', value: `${hakSayisi}`, inline: true },
            ],
            0x32cd32 // Yeşil
        );

        // İlk defer mesajını asıl yanıt ile düzenleme
        await interaction.editReply({ 
            content: `✅ **${kullanici.tag}** kullanıcısının partnerlik hakkı başarıyla **${hakSayisi}** olarak ayarlandı. (Önceki Hak: ${oldHakSayisi})`, 
        });
    }

    // --- /ping Komutu ---
    else if (commandName === 'ping') {
        const latency = Date.now() - interaction.createdTimestamp;
        await interaction.reply({ 
            content: `🏓 Pong! Bot Gecikmesi: **${latency}ms**, API Gecikmesi: **${client.ws.ping}ms**`, 
            ephemeral: true 
        });
    }

    // --- /partner Komutu ---
    else if (commandName === 'partner') {
        
        const userId = member.id;
        let kalanHak = userPartnerRights[userId] || 0;

        // Unknown Interaction hatasını engellemek için komutun başında deferReply kullanılır.
        // Yanıtın ephemeral olması gerektiği için ephemeral: true kullanılır.
        await interaction.deferReply({ ephemeral: true }); 

        if (!PARTNER_DUYURU_KANAL_ID) {
            await interaction.editReply({ 
                content: 'HATA: Partnerlik duyurusu kanalı `.env` dosyasında ayarlanmamış (`PARTNER_DUYURU_KANAL_ID`).', 
            });
            return;
        }

        // Hak Kontrolü
        if (kalanHak <= 0) {
            await interaction.editReply({ 
                content: 'Partnerlik duyurusu yapmak için **kalan hakkınız bulunmamaktadır**.', 
            });
            return;
        }
        
        // Hak Kullanımı (Decrement)
        userPartnerRights[userId] = kalanHak - 1;
        kalanHak = userPartnerRights[userId]; // Yeni kalan hak

        const davetLinki = interaction.options.getString('davet-linki');
        const mesaj = interaction.options.getString('mesaj');

        // URL TİPİ GEÇERSİZ HATASI DÜZELTMESİ (https:// ekleme)
        let safeDavetLinki = davetLinki;
        if (!safeDavetLinki.startsWith('http://') && !safeDavetLinki.startsWith('https://')) {
            safeDavetLinki = `https://${safeDavetLinki}`;
        }
        
        // Gönderilecek Embed Mesajı
        const partnerEmbed = {
            color: 0x0099ff, 
            title: `✨ Yeni Partner Sunucu: ${interaction.guild.name} ✨`,
            url: safeDavetLinki, 
            author: {
                name: member.user.tag,
                icon_url: member.user.displayAvatarURL(),
            },
            description: `**Partnerlik Mesajı:**\n\n${mesaj}\n\n**Davet Linki:** ${safeDavetLinki}`,
            timestamp: new Date().toISOString(),
            footer: {
                text: `Duyuru ${interaction.guild.name} tarafından yapıldı. | Kalan Hak: ${kalanHak}`,
            },
        };

        // Mesajı SABİT duyuru kanala gönderme
        try {
            const announcementChannel = await client.channels.fetch(PARTNER_DUYURU_KANAL_ID);
            
            if (!announcementChannel) {
                 throw new Error(`Duyuru kanalı (${PARTNER_DUYURU_KANAL_ID}) bot tarafından bulunamadı veya erişilemiyor.`);
            }

            await announcementChannel.send({ embeds: [partnerEmbed] });
        } catch (error) {
            console.error('Partnerlik mesajı sabit kanala gönderilirken hata oluştu:', error);
            await interaction.editReply({ 
                content: `Duyuru mesajı gönderilemedi! Hata: ${error.message.substring(0, 100)}` 
            });
            return; 
        }
        
        // Log kanalına kullanım kaydını gönderme
        await sendLog(client, 'Partner Kullanım Kaydı (LOG)', 
            `**Partnerlik Başarıyla Yapıldı ve Hak Düşüldü**`,
            [
                { name: 'Kullanan Kullanıcı', value: `${member.user.tag} (${userId})`, inline: false },
                { name: 'Yapılan Kanal', value: `<#${PARTNER_DUYURU_KANAL_ID}>`, inline: true },
                { name: 'Kalan Hak', value: `${kalanHak}`, inline: true },
                { name: 'Davet Linki', value: safeDavetLinki, inline: false },
            ],
            0xff4500 // Kırmızı/Turuncu
        );
        
        // İlk defer mesajını asıl yanıt ile düzenleme
        await interaction.editReply({ 
            content: `**Partnerlik Duyurusu Başarıyla Yapıldı!** Duyuru <#${PARTNER_DUYURU_KANAL_ID}> kanalına gönderildi. Kalan Hakkınız: **${kalanHak}**`, 
        });
    }
});


// Botu başlatma
client.login(TOKEN);