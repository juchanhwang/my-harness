'use client';

import { useCallback } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useOrders, useDeleteOrder } from '@/hooks/useOrders';
import type { Order, OrderStatus } from '@/hooks/useOrders';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';

// --- Constants ---

const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: '전체' },
  { value: 'pending', label: '대기중' },
  { value: 'completed', label: '완료' },
  { value: 'cancelled', label: '취소' },
] as const;

const STATUS_CONFIG: Record<
  OrderStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' }
> = {
  pending: { label: '대기중', variant: 'secondary' },
  completed: { label: '완료', variant: 'default' },
  cancelled: { label: '취소', variant: 'destructive' },
};

const VALID_STATUSES = new Set<string>([
  'all',
  'pending',
  'completed',
  'cancelled',
]);

// --- Helpers ---

function isValidStatusFilter(value: string): value is OrderStatus | 'all' {
  return VALID_STATUSES.has(value);
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
  }).format(amount);
}

function formatDate(dateString: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(dateString));
}

// --- Main Component ---

export function OrderList() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const rawStatus = searchParams.get('status') ?? 'all';
  const currentStatus = isValidStatusFilter(rawStatus) ? rawStatus : 'all';
  const rawPage = Number(searchParams.get('page') ?? '1');
  const currentPage = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;

  const { data } = useOrders({ status: currentStatus, page: currentPage });
  const { mutate: deleteOrder, isPending: isDeleting } = useDeleteOrder();

  const updateSearchParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, value]) => {
        if (value === 'all' || value === '1') {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      });
      const queryString = params.toString();
      router.push(queryString ? `${pathname}?${queryString}` : pathname);
    },
    [searchParams, router, pathname],
  );

  const handleStatusChange = (status: string) => {
    updateSearchParams({ status, page: '1' });
  };

  const handlePageChange = (page: number) => {
    updateSearchParams({ page: String(page) });
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {STATUS_FILTER_OPTIONS.map((option) => (
          <Button
            key={option.value}
            variant={currentStatus === option.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleStatusChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      {data.orders.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          주문이 없습니다.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>주문번호</TableHead>
              <TableHead>고객명</TableHead>
              <TableHead>상태</TableHead>
              <TableHead className="text-right">금액</TableHead>
              <TableHead>주문일</TableHead>
              <TableHead className="text-right">작업</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.orders.map((order) => (
              <OrderRow
                key={order.id}
                order={order}
                onDelete={deleteOrder}
                isDeleting={isDeleting}
              />
            ))}
          </TableBody>
        </Table>
      )}

      {data.totalPages > 1 && (
        <Pagination
          currentPage={data.currentPage}
          totalPages={data.totalPages}
          onPageChange={handlePageChange}
        />
      )}
    </div>
  );
}

// --- Sub-components ---

interface OrderRowProps {
  order: Order;
  onDelete: (orderId: string) => void;
  isDeleting: boolean;
}

function OrderRow({ order, onDelete, isDeleting }: OrderRowProps) {
  const { label, variant } = STATUS_CONFIG[order.status];

  return (
    <TableRow>
      <TableCell className="font-medium">{order.orderNumber}</TableCell>
      <TableCell>{order.customerName}</TableCell>
      <TableCell>
        <Badge variant={variant}>{label}</Badge>
      </TableCell>
      <TableCell className="text-right">
        {formatCurrency(order.totalAmount)}
      </TableCell>
      <TableCell>{formatDate(order.createdAt)}</TableCell>
      <TableCell className="text-right">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" disabled={isDeleting}>
              삭제
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>주문을 삭제하시겠습니까?</AlertDialogTitle>
              <AlertDialogDescription>
                주문번호 {order.orderNumber}을(를) 삭제합니다. 이 작업은 되돌릴
                수 없습니다.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>취소</AlertDialogCancel>
              <AlertDialogAction onClick={() => onDelete(order.id)}>
                삭제
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TableCell>
    </TableRow>
  );
}

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);

  return (
    <div className="flex items-center justify-center gap-1">
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
      >
        이전
      </Button>
      {pages.map((page) => (
        <Button
          key={page}
          variant={page === currentPage ? 'default' : 'outline'}
          size="sm"
          onClick={() => onPageChange(page)}
        >
          {page}
        </Button>
      ))}
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
      >
        다음
      </Button>
    </div>
  );
}
