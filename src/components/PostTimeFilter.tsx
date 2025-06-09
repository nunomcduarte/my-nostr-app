import { CalendarIcon, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import type { TimeFilter } from '@/lib/postFilters';

interface PostTimeFilterProps {
  filter: TimeFilter;
  onFilterChange: (filter: TimeFilter) => void;
  totalCount: number;
  filteredCount: number;
}

export function PostTimeFilter({ filter, onFilterChange, totalCount, filteredCount }: PostTimeFilterProps) {
  const quickFilters = [
    { label: 'All Time', value: 'all' },
    { label: 'Today', value: 'today' },
    { label: 'This Week', value: 'week' },
    { label: 'This Month', value: 'month' },
    { label: 'Custom Range', value: 'custom' },
  ];

  const handleQuickFilter = (type: TimeFilter['type']) => {
    const today = new Date();
    
    switch (type) {
      case 'all':
        onFilterChange({ type: 'all' });
        break;
      case 'today':
        onFilterChange({
          type: 'today',
          startDate: startOfDay(today),
          endDate: endOfDay(today),
        });
        break;
      case 'week':
        onFilterChange({
          type: 'week',
          startDate: startOfDay(subDays(today, 7)),
          endDate: endOfDay(today),
        });
        break;
      case 'month':
        onFilterChange({
          type: 'month',
          startDate: startOfDay(subDays(today, 30)),
          endDate: endOfDay(today),
        });
        break;
      case 'custom':
        onFilterChange({ type: 'custom' });
        break;
    }
  };

  const handleDateSelect = (date: Date | undefined, type: 'start' | 'end') => {
    if (!date) return;
    
    const newFilter = { ...filter };
    if (type === 'start') {
      newFilter.startDate = startOfDay(date);
    } else {
      newFilter.endDate = endOfDay(date);
    }
    
    onFilterChange(newFilter);
  };

  const clearFilter = () => {
    onFilterChange({ type: 'all' });
  };

  const getFilterLabel = () => {
    switch (filter.type) {
      case 'all':
        return 'All Time';
      case 'today':
        return 'Today';
      case 'week':
        return 'Last 7 Days';
      case 'month':
        return 'Last 30 Days';
      case 'custom':
        if (filter.startDate && filter.endDate) {
          return `${format(filter.startDate, 'MMM d')} - ${format(filter.endDate, 'MMM d')}`;
        } else if (filter.startDate) {
          return `From ${format(filter.startDate, 'MMM d')}`;
        } else if (filter.endDate) {
          return `Until ${format(filter.endDate, 'MMM d')}`;
        }
        return 'Custom Range';
      default:
        return 'Filter';
    }
  };

  const hasActiveFilter = filter.type !== 'all';

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Filter by time:</span>
      </div>
      
      <Select value={filter.type} onValueChange={handleQuickFilter}>
        <SelectTrigger className="w-36">
          <SelectValue placeholder="Select filter" />
        </SelectTrigger>
        <SelectContent>
          {quickFilters.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {filter.type === 'custom' && (
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "justify-start text-left font-normal",
                  !filter.startDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {filter.startDate ? format(filter.startDate, "MMM d, yyyy") : "Start date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={filter.startDate}
                onSelect={(date) => handleDateSelect(date, 'start')}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          <span className="text-muted-foreground">to</span>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "justify-start text-left font-normal",
                  !filter.endDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {filter.endDate ? format(filter.endDate, "MMM d, yyyy") : "End date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={filter.endDate}
                onSelect={(date) => handleDateSelect(date, 'end')}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Badge variant={hasActiveFilter ? "default" : "secondary"}>
          {filteredCount} of {totalCount} posts
        </Badge>
        
        {hasActiveFilter && (
          <Button variant="ghost" size="sm" onClick={clearFilter}>
            Clear
          </Button>
        )}
      </div>

      {hasActiveFilter && (
        <div className="text-sm text-muted-foreground">
          Showing: {getFilterLabel()}
        </div>
      )}
    </div>
  );
}

