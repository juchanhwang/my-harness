import {
  useSuspenseQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';

// --- Types ---

export type OrderStatus = 'pending' | 'completed' | 'cancelled';

export interface Order {
  id: string;
  orderNumber: string;
  customerName: string;
  status: OrderStatus;
  totalAmount: number;
  createdAt: string;
}

export interface OrderFilters {
  status: OrderStatus | 'all';
  page: number;
}

export interface PaginatedOrders {
  orders: Order[];
  totalCount: number;
  totalPages: number;
  currentPage: number;
}

// --- Query Keys ---

export const orderQueryKeys = {
  all: ['orders'] as const,
  lists: () => [...orderQueryKeys.all, 'list'] as const,
  list: (filters: OrderFilters) =>
    [...orderQueryKeys.lists(), filters] as const,
};

// --- API ---

async function fetchOrders(filters: OrderFilters): Promise<PaginatedOrders> {
  const params = new URLSearchParams();
  if (filters.status !== 'all') {
    params.set('status', filters.status);
  }
  params.set('page', String(filters.page));

  const res = await fetch(`/api/orders?${params.toString()}`);
  if (!res.ok) {
    throw new Error('주문 목록을 불러오는데 실패했습니다');
  }
  return res.json();
}

async function deleteOrderApi(orderId: string): Promise<void> {
  const res = await fetch(`/api/orders/${orderId}`, { method: 'DELETE' });
  if (!res.ok) {
    throw new Error('주문 삭제에 실패했습니다');
  }
}

// --- Hooks ---

export function useOrders(filters: OrderFilters) {
  return useSuspenseQuery({
    queryKey: orderQueryKeys.list(filters),
    queryFn: () => fetchOrders(filters),
    staleTime: 30_000,
  });
}

export function useDeleteOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteOrderApi,
    onMutate: async (orderId) => {
      await queryClient.cancelQueries({ queryKey: orderQueryKeys.lists() });

      const previousQueries = queryClient.getQueriesData<PaginatedOrders>({
        queryKey: orderQueryKeys.lists(),
      });

      queryClient.setQueriesData<PaginatedOrders>(
        { queryKey: orderQueryKeys.lists() },
        (old) =>
          old
            ? {
                ...old,
                orders: old.orders.filter((order) => order.id !== orderId),
                totalCount: old.totalCount - 1,
              }
            : old,
      );

      return { previousQueries };
    },
    onSuccess: () => {
      toast.success('주문이 삭제되었습니다.');
    },
    onError: (_err, _id, context) => {
      context?.previousQueries.forEach(([queryKey, data]) => {
        queryClient.setQueryData(queryKey, data);
      });
      toast.error('주문 삭제에 실패했습니다. 다시 시도해주세요.');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: orderQueryKeys.all });
    },
  });
}
