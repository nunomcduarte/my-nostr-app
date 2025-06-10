import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';
import { useCurrentUser } from './useCurrentUser';

export interface ZapData {
  amount: number; // in sats
  createdAt: number;
  sender: string;
  eventId?: string; // The event that was zapped
  message?: string; // Zap comment
}

export interface ZapAnalytics {
  totalZaps: number;
  totalAmount: number; // in sats
  averageAmount: number; // in sats
  recentZaps: ZapData[];
  topZappers: Array<{ pubkey: string; amount: number; count: number }>;
}

function parseBolt11Amount(invoice: string): number {
  try {
    // Match amount in bolt11 invoice format
    const amountMatch = invoice.match(/lnbc(\d+)([munp]?)/i);
    if (!amountMatch) return 0;
    
    const amount = parseInt(amountMatch[1]);
    const unit = amountMatch[2]?.toLowerCase();
    
    // Convert to sats
    switch (unit) {
      case 'm': return amount * 100000; // milli-bitcoin to sats
      case 'u': return amount * 100; // micro-bitcoin to sats  
      case 'n': return amount / 10; // nano-bitcoin to sats
      case 'p': return amount / 10000; // pico-bitcoin to sats
      default: return amount * 100000000; // bitcoin to sats
    }
  } catch (error) {
    console.warn('Failed to parse bolt11 invoice:', error);
    return 0;
  }
}

export function useZapAnalytics() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();

  return useQuery({
    queryKey: ['zap-analytics', user?.pubkey],
    queryFn: async (c): Promise<ZapAnalytics> => {
      if (!user?.pubkey) {
        return {
          totalZaps: 0,
          totalAmount: 0,
          averageAmount: 0,
          recentZaps: [],
          topZappers: [],
        };
      }

      const signal = AbortSignal.any([c.signal, AbortSignal.timeout(10000)]);
      
      // Get zap receipts (kind 9735) for the current user
      const zapReceipts = await nostr.query([
        { 
          kinds: [9735], 
          '#p': [user.pubkey],
          limit: 1000 // Get a good sample of recent zaps
        }
      ], { signal });

      const zapData: ZapData[] = [];
      const zapperAmounts = new Map<string, { amount: number; count: number }>();

      for (const zap of zapReceipts) {
        // Extract bolt11 invoice
        const bolt11Tag = zap.tags.find(tag => tag[0] === 'bolt11');
        if (!bolt11Tag?.[1]) continue;

        const amount = parseBolt11Amount(bolt11Tag[1]);
        if (amount <= 0) continue;

        // Extract zap request from description tag
        const descriptionTag = zap.tags.find(tag => tag[0] === 'description');
        let zapRequest: { pubkey?: string; content?: string; tags?: string[][] } | null = null;
        let sender = '';
        let message = '';
        let eventId: string | undefined;

        if (descriptionTag?.[1]) {
          try {
            zapRequest = JSON.parse(descriptionTag[1]);
            sender = zapRequest?.pubkey || '';
            message = zapRequest?.content || '';
            
            // Find the event being zapped
            const eTag = zapRequest?.tags?.find((tag: string[]) => tag[0] === 'e');
            eventId = eTag?.[1];
          } catch (error) {
            console.warn('Failed to parse zap request:', error);
          }
        }

        // If no sender from zap request, try to get from P tag
        if (!sender) {
          const pTag = zap.tags.find(tag => tag[0] === 'P');
          sender = pTag?.[1] || '';
        }

        zapData.push({
          amount,
          createdAt: zap.created_at,
          sender,
          eventId,
          message,
        });

        // Track amounts by sender
        if (sender) {
          const existing = zapperAmounts.get(sender) || { amount: 0, count: 0 };
          zapperAmounts.set(sender, {
            amount: existing.amount + amount,
            count: existing.count + 1,
          });
        }
      }

      // Sort zaps by date (newest first)
      zapData.sort((a, b) => b.createdAt - a.createdAt);

      // Create top zappers list
      const topZappers = Array.from(zapperAmounts.entries())
        .map(([pubkey, data]) => ({ pubkey, ...data }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 10); // Top 10 zappers

      const totalAmount = zapData.reduce((sum, zap) => sum + zap.amount, 0);
      const totalZaps = zapData.length;
      const averageAmount = totalZaps > 0 ? Math.round(totalAmount / totalZaps) : 0;

      return {
        totalZaps,
        totalAmount,
        averageAmount,
        recentZaps: zapData.slice(0, 50), // Most recent 50 zaps
        topZappers,
      };
    },
    enabled: !!user?.pubkey,
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
  });
}