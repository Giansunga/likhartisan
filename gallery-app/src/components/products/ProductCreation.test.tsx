import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import AddProductDialog from './AddProductDialog';
import Product3DToolsPage from './Product3DToolsPage';
import { ADMIN_PRODUCT_PATHS, ARTISAN_PRODUCT_PATHS, type ProductCreationPaths } from './productCreationPaths';
function Entry({ paths }: { paths: ProductCreationPaths }) {
  const [open, setOpen] = useState(false);
  return <><button onClick={() => setOpen(true)}>Add Product</button>{open && <AddProductDialog paths={paths} onClose={() => setOpen(false)} />}</>;
}
function renderFlow(paths: ProductCreationPaths, initial = paths.list) {
  return render(<MemoryRouter initialEntries={[initial]}><Routes>
    <Route path={paths.list} element={<Entry paths={paths} />} />
    <Route path={paths.tools} element={<Product3DToolsPage paths={paths} />} />
    <Route path={paths.create} element={<h1>Product upload form</h1>} />
  </Routes></MemoryRouter>);
}
describe.each([['admin', ADMIN_PRODUCT_PATHS], ['artisan', ARTISAN_PRODUCT_PATHS]] as const)('%s product entry', (_name, paths) => {
  it('defaults to external creation, lists tools and continues to the matching form', async () => {
    renderFlow(paths);
    fireEvent.click(screen.getByRole('button', { name: 'Add Product' }));
    expect(screen.getByRole('dialog', { name: 'Add New Product' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Create 3D Model/ })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'View 3D tools' }));
    expect(await screen.findByRole('heading', { name: 'Convert Images to 3D' })).toBeInTheDocument();
    for (const name of ['Meshy', 'Tripo3D', 'Hi3D', 'Rodin']) {
      const visit = screen.getByRole('link', { name: `Visit ${name} (opens in a new tab)` });
      expect(visit).toHaveAttribute('target', '_blank'); expect(visit).toHaveAttribute('rel', 'noopener noreferrer');
    }
    expect(screen.getByRole('link', { name: 'Visit Hi3D (opens in a new tab)' })).toHaveAttribute('href', 'https://hi3d.pro/');
    expect(screen.getByText(/Product images: up to 5 MB/)).toHaveTextContent('25 MB');
    fireEvent.click(screen.getByRole('link', { name: 'Continue to product form' }));
    expect(screen.getByRole('heading', { name: 'Product upload form' })).toBeInTheDocument();
  });
  it('opens direct import without visiting the tools page', async () => {
    renderFlow(paths); fireEvent.click(screen.getByRole('button', { name: 'Add Product' }));
    fireEvent.click(screen.getByRole('radio', { name: /Upload Existing Product/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue to product form' }));
    expect(await screen.findByRole('heading', { name: 'Product upload form' })).toBeInTheDocument();
  });
  it('closes with the close button or Escape and restores focus', async () => {
    renderFlow(paths); const trigger = screen.getByRole('button', { name: 'Add Product' }); trigger.focus();
    fireEvent.click(trigger); fireEvent.click(screen.getByRole('button', { name: 'Close popup' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(trigger).toHaveFocus();
    fireEvent.click(trigger); fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
  it('supports direct tools navigation and Cancel returns to the product list', () => {
    renderFlow(paths, paths.tools); fireEvent.click(screen.getByRole('link', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Add Product' })).toBeInTheDocument();
  });
});
