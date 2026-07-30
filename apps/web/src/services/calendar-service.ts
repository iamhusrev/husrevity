import apiClient from "./api-client";
import { ApiResponse } from "@/types/common/api-response";
import { EventRequest, EventResponse } from "@/types/calendar/calendar-event";
import { CALENDAR_ENDPOINTS } from "@/utils/api-endpoints";

export interface EventRangeFilter {
  from?: string;
  to?: string;
}

export const calendarService = {
  async listEvents(filter?: EventRangeFilter): Promise<ApiResponse<EventResponse[]>> {
    const res = await apiClient.get(CALENDAR_ENDPOINTS.EVENTS, {
      params: filter,
    });
    return res.data;
  },

  async getEvent(id: number): Promise<ApiResponse<EventResponse>> {
    const res = await apiClient.get(CALENDAR_ENDPOINTS.EVENT_BY_ID(id));
    return res.data;
  },

  async createEvent(body: EventRequest): Promise<ApiResponse<EventResponse>> {
    const res = await apiClient.post(CALENDAR_ENDPOINTS.EVENTS, body);
    return res.data;
  },

  async updateEvent(id: number, body: EventRequest): Promise<ApiResponse<EventResponse>> {
    const res = await apiClient.put(CALENDAR_ENDPOINTS.EVENT_BY_ID(id), body);
    return res.data;
  },

  async deleteEvent(id: number): Promise<ApiResponse<void>> {
    const res = await apiClient.delete(CALENDAR_ENDPOINTS.EVENT_BY_ID(id));
    return res.data;
  },

  async restoreEvent(id: number): Promise<ApiResponse<EventResponse>> {
    const res = await apiClient.patch(CALENDAR_ENDPOINTS.EVENT_RESTORE(id));
    return res.data;
  },
};
