(defun main ()
  (loop for row from 1 to 4 do
    (dotimes (col row)
      (write-char (code-char 42)))
    (write-char (code-char 10)))
  (loop for c from 97 to 101 do
    (write-char (code-char (- c 32))))
  (format t "~%[~5d][~3d]~%" 42 7))

(main)
