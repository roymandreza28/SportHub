import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { deleteVenueMedia, uploadVenueMedia, type Venue } from '../../lib/venueApi'
import { input, label } from '../../lib/formStyles'
import { extractErrorMessage } from '../../lib/errors'

// Same "act immediately, invalidate the query" pattern as
// CourtEquipmentManager, alongside it in VenueEditModal — every add/remove
// here takes effect right away rather than being staged for the modal's
// own Save button.
export function VenuePhotoManager({ venue }: { venue: Venue }) {
  const queryClient = useQueryClient()
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['facilitator', 'venues'] })

  const [pendingCount, setPendingCount] = useState(0)

  const upload = useMutation({
    mutationFn: (files: File[]) => uploadVenueMedia(venue.id, files),
    onSuccess: () => {
      setPendingCount(0)
      invalidate()
    },
    onError: () => setPendingCount(0),
  })

  const remove = useMutation({ mutationFn: deleteVenueMedia, onSuccess: invalidate })

  return (
    <div className="flex flex-col gap-3">
      <p className={label}>Photos</p>

      {venue.media.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {venue.media.map((photo) => (
            <div key={photo.id} className="relative h-20 w-20 overflow-hidden rounded-lg border border-slate-200">
              <img src={photo.url} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => remove.mutate(photo.id)}
                disabled={remove.isPending}
                className="absolute right-0.5 top-0.5 rounded-full bg-slate-900/70 px-1.5 text-xs font-bold text-pure-white"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}
      {venue.media.length === 0 && <p className="text-sm text-slate-400">No photos yet.</p>}

      <div className="flex items-center gap-2">
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={(e) => {
            const files = Array.from(e.target.files ?? [])
            e.target.value = ''
            if (files.length === 0) return
            setPendingCount(files.length)
            upload.mutate(files)
          }}
          disabled={upload.isPending}
          className={`${input} max-w-xs`}
        />
        {upload.isPending && (
          <span className="text-xs text-slate-500">Uploading {pendingCount} photo{pendingCount > 1 ? 's' : ''}...</span>
        )}
      </div>
      {upload.isError && <p className="text-xs text-red-600">{extractErrorMessage(upload.error)}</p>}
    </div>
  )
}
