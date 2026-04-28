"use client";

import { Suspense, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import type { Order, OrderStatus } from "./types";
import { ORDER_STATUS_LABEL } from "./types";
import { useOrders } from "./useOrders";

const STATUS_VARIANT: Record<OrderStatus, "default" | "secondary" | "destructive"> = {
  pending: "secondary",
  completed: "default",
  cancelled: "destructive",
};

function StatusFilter({
  current,
  onChange,
}: {
  current: "all" | OrderStatus;
  onChange: (status: "all" | OrderStatus) => void;
}) {
  const statuses = Object.keys(ORDER_STATUS_LABEL) as Array<"all" | OrderStatus>;

  return (
    <div className="flex gap-2">
      {statuses.map((s) => (
        <Button
          key={s}
          variant={current === s ? "default" : "outline"}
          size="sm"
          onClick={() => onChange(s)}
        >
          {ORDER_STATUS_LABEL[s]}
        </Button>
      ))}
    </div>
  );
}

function Pagination({
  currentPage,
  totalPages,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  const pages: number[] = [];
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, currentPage + 2);
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  return (
    <div className="flex items-center justify-center gap-1">
      <Button
        variant="outline"
        size="sm"
        disabled={currentPage <= 1}
        onClick={() => onPageChange(currentPage - 1)}
      >
        이전
      </Button>
      {start > 1 && (
        <>
          <Button variant="outline" size="sm" onClick={() => onPageChange(1)}>
            1
          </Button>
          {start > 2 && <span className="px-2 text-muted-foreground">...</span>}
        </>
      )}
      {pages.map((p) => (
        <Button
          key={p}
          variant={p === currentPage ? "default" : "outline"}
          size="sm"
          onClick={() => onPageChange(p)}
        >
          {p}
        </Button>
      ))}
      {end < totalPages && (
        <>
          {end < totalPages - 1 && (
            <span className="px-2 text-muted-foreground">...</span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(totalPages)}
          >
            {totalPages}
          </Button>
        </>
      )}
      <Button
        variant="outline"
        size="sm"
        disabled={currentPage >= totalPages}
        onClick={() => onPageChange(currentPage + 1)}
      >
        다음
      </Button>
    </div>
  );
}

function OrderTableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

function OrderListInner() {
  const {
    orders,
    totalPages,
    currentPage,
    status,
    isLoading,
    isError,
    error,
    setStatus,
    setPage,
    deleteOrder,
    isDeleting,
  } = useOrders();

  const [deleteTarget, setDeleteTarget] = useState<Order | null>(null);

  function handleDelete() {
    if (!deleteTarget) return;
    deleteOrder(deleteTarget.id);
    setDeleteTarget(null);
  }

  return (
    <div className="space-y-4">
      <StatusFilter current={status} onChange={setStatus} />

      {isLoading ? (
        <OrderTableSkeleton />
      ) : isError ? (
        <div className="rounded-md border border-destructive p-4 text-destructive">
          {error instanceof Error
            ? error.message
            : "주문 목록을 불러오지 못했습니다."}
        </div>
      ) : orders.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
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
              <TableHead className="w-[80px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order) => (
              <TableRow key={order.id}>
                <TableCell className="font-medium">
                  {order.orderNumber}
                </TableCell>
                <TableCell>{order.customerName}</TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[order.status]}>
                    {ORDER_STATUS_LABEL[order.status]}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {order.totalAmount.toLocaleString("ko-KR")}원
                </TableCell>
                <TableCell>
                  {new Date(order.createdAt).toLocaleDateString("ko-KR")}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isDeleting}
                    onClick={() => setDeleteTarget(order)}
                  >
                    삭제
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setPage}
      />

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>주문 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              주문 {deleteTarget?.orderNumber}을(를) 삭제하시겠습니까? 이 작업은
              되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function OrderList() {
  return (
    <Suspense fallback={<OrderTableSkeleton />}>
      <OrderListInner />
    </Suspense>
  );
}
