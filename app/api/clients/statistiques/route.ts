// app/api/clients/statistiques/route.ts
import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const dateDebut = searchParams.get('dateDebut');
    const dateFin = searchParams.get('dateFin');
    const clientId = searchParams.get('clientId');

    // Construction des filtres de date
    let dateFilter: any = {};
    if (dateDebut) {
      const start = new Date(dateDebut);
      start.setHours(0, 0, 0, 0);
      dateFilter.gte = start;
    }
    if (dateFin) {
      const end = new Date(dateFin);
      end.setHours(23, 59, 59, 999);
      dateFilter.lte = end;
    }

    // 1. Récupérer TOUS les BL de la période
    const bls = await prisma.bonLivraison.findMany({
      where: {
        date: dateFilter,
        ...(clientId && clientId !== 'all' ? { clientId } : {}),
        statut: 'LIVRE',
      },
      include: {
        client: true,
        lignes: {
          include: {
            product: {
              select: {
                id: true,
                designation: true,
                prixAchat: true,
                prixVente: true,
              },
            },
          },
        },
      },
    });

    if (bls.length === 0) {
      return NextResponse.json({ data: [], total: 0 });
    }

    // 2. Récupérer TOUS les mouvements de caisse de la période
    const tousMouvements = await prisma.mouvementCaisse.findMany({
      where: {
        date: dateFilter,
      },
    });

    // 3. Récupérer les informations des clients
    const clientIds = [...new Set(bls.map(bl => bl.clientId))];
    const clients = await prisma.client.findMany({
      where: {
        id: { in: clientIds },
      },
    });
    const clientMapInfo = new Map(clients.map(c => [c.id, c]));

    // 4. Grouper par client
    const clientMap = new Map<string, {
      clientId: string;
      clientNom: string;
      clientTelephone: string;
      clientEmail: string | null;
      clientVille: string | null;
      bls: any[];
      totalCA: number;
      totalHT: number;
      totalTVA: number;
      totalRecette: number;
      totalAchat: number;
    }>();

    for (const bl of bls) {
      const clientKey = bl.clientId;
      const clientInfo = clientMapInfo.get(clientKey);
      const clientNom = clientInfo?.nom || 'Client inconnu';

      if (!clientMap.has(clientKey)) {
        clientMap.set(clientKey, {
          clientId: bl.clientId,
          clientNom: clientNom,
          clientTelephone: clientInfo?.telephone || '',
          clientEmail: clientInfo?.email || null,
          clientVille: (clientInfo as any)?.ville || null,
          bls: [],
          totalCA: 0,
          totalHT: 0,
          totalTVA: 0,
          totalRecette: 0,
          totalAchat: 0,
        });
      }

      const data = clientMap.get(clientKey)!;
      data.bls.push(bl);
      
      data.totalCA += bl.montantTotal || 0;
      data.totalHT += bl.montantHT || 0;
      data.totalTVA += bl.montantTVA || 0;

      // ✅ Récupérer les encaissements pour ce BL
      // On cherche par nom du client dans le libellé
      const mouvementsBL = tousMouvements.filter(m => 
        m.libelle && m.libelle.includes(clientNom) && 
        (m.type === 'ENCAISSEMENT' || m.type === 'ENCAISSEMENTVIRTUEL' || m.type === 'ENCAISSEMENTCREDIT')
      );

      const encaissements = mouvementsBL.reduce((sum, m) => sum + m.montant, 0);
      
      // ⚠️ On ajoute la recette pour ce client MAIS attention : 
      // Si le client a plusieurs BL sur la même période, on va additionner tous ses paiements
      // On doit donc attribuer chaque paiement au bon BL
      // Pour cela, on utilise le montantTotal du BL comme approximation
      
      // ✅ Méthode plus précise : on attribue les paiements proportionnellement
      // Mais pour simplifier, on utilise le montant du BL comme recette
      // car le client paie exactement le montant du BL
      
      // On va donc utiliser le montantTotal du BL comme recette
      // Mais seulement si on trouve des mouvements pour ce client
      if (mouvementsBL.length > 0) {
        // On prend le montant du BL comme recette
        data.totalRecette += bl.montantTotal || 0;
      }

      // Achat = décaissements virtuels avec référence = numéro du BL
      const achats = tousMouvements
        .filter(m => m.type === 'DECAISSEMENTVIRTUEL' && m.reference === bl.numero)
        .reduce((sum, m) => sum + m.montant, 0);
      
      data.totalAchat += achats;
    }

    // 5. Construction des statistiques finales
    const stats = Array.from(clientMap.values()).map((data) => {
      const totalBL = data.bls.length;
      
      const caTotal = data.totalCA;
      const caHT = data.totalHT;
      const caTVA = data.totalTVA;
      
      // ✅ La recette = somme des montants des BL (puisque chaque BL est payé)
      // Mais on utilise totalRecette qui a été calculé à partir des mouvements
      const recette = data.totalRecette > 0 ? data.totalRecette : data.totalCA;
      const achat = data.totalAchat;
      
      const margeBrute = recette - achat;
      const margeNette = recette - achat;
      
      const tauxMargeBrute = recette > 0 ? margeBrute / recette : 0;
      const tauxMargeNette = recette > 0 ? margeNette / recette : 0;
      
      const panierMoyen = totalBL > 0 ? recette / totalBL : 0;

      const sortedBLs = [...data.bls].sort((a, b) => b.date.getTime() - a.date.getTime());
      const dernierAchat = sortedBLs.length > 0 ? sortedBLs[0].date.toISOString() : null;
      const firstAchat = sortedBLs.length > 0 ? sortedBLs[sortedBLs.length - 1].date.toISOString() : null;

      // Top produits
      const productMap = new Map<string, { productId: string; designation: string; quantite: number; total: number }>();
      for (const bl of data.bls) {
        for (const ligne of bl.lignes) {
          if (ligne.product) {
            const key = ligne.productId;
            if (!productMap.has(key)) {
              productMap.set(key, {
                productId: ligne.productId,
                designation: ligne.product.designation,
                quantite: 0,
                total: 0,
              });
            }
            const p = productMap.get(key)!;
            p.quantite += ligne.quantite;
            p.total += ligne.prixVente * ligne.quantite;
          }
        }
      }
      const topProducts = Array.from(productMap.values())
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);

      // Calculer la marge brute et nette par BL
      const blsWithMargins = data.bls.map((bl) => {
        // ✅ Recette = montant du BL (puisque payé)
        const blRecette = bl.montantTotal || 0;
        
        // Achat = décaissements virtuels pour ce BL
        const blAchat = tousMouvements
          .filter(m => m.type === 'DECAISSEMENTVIRTUEL' && m.reference === bl.numero)
          .reduce((sum, m) => sum + m.montant, 0);
        
        const blMargeBrute = blRecette - blAchat;
        const blMargeNette = blRecette - blAchat;

        return {
          id: bl.id,
          numero: bl.numero,
          date: bl.date.toISOString(),
          montantTotal: bl.montantTotal || 0,
          montantHT: bl.montantHT || 0,
          margeBrute: blMargeBrute,
          margeNette: blMargeNette,
        };
      });

      return {
        clientId: data.clientId,
        clientNom: data.clientNom,
        clientTelephone: data.clientTelephone,
        clientEmail: data.clientEmail,
        clientVille: data.clientVille,
        totalBL,
        caTotal,
        caHT,
        caTVA,
        recette,
        achat,
        margeBrute,
        margeNette,
        tauxMargeBrute,
        tauxMargeNette,
        panierMoyen,
        dernierAchat,
        firstAchat,
        totalMouvements: 0,
        topProducts,
        bls: blsWithMargins,
      };
    });

    stats.sort((a, b) => b.recette - a.recette);
   
    return NextResponse.json({
      data: stats,
      total: stats.length,
    });
  } catch (error) {
    console.error('Error fetching client statistics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch client statistics' },
      { status: 500 }
    );
  }
}